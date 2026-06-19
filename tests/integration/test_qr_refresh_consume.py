"""Integration test: QR pairing refresh token is never left at rest (fix-brief #1).

The plaintext refresh token handed to a paired device lives in qr_sessions only
between qr/approve and the paired device's first qr/poll. qr_poll must perform a
one-time read: as soon as the refresh is set as the device's HttpOnly cookie, the
plaintext column is nulled. This test fails if that consume step is reverted.
"""

import pytest

pytestmark = pytest.mark.integration

STRONG_PASSWORD = "anypass8chars"


def _register_and_login(client) -> str:
    email = "qr-consume@example.com"
    reg = client.post(
        "/api/v1/register",
        json={"email": email, "username": "qruser", "password": STRONG_PASSWORD},
    )
    assert reg.status_code == 201, reg.text
    login = client.post(
        "/api/v1/login", json={"email": email, "password": STRONG_PASSWORD}
    )
    assert login.status_code == 200, login.text
    access = login.json()["access_token"]
    assert access
    return access


def _qr_row(token: str):
    # The in-memory SessionStore backing the test app; the Postgres repo mirrors
    # the same consume_qr_refresh contract.
    from app.services.session_store import session_store

    return session_store._impl._qr.get(token)


def test_qr_poll_consumes_plaintext_refresh(auth_client) -> None:
    access = _register_and_login(auth_client)
    auth_headers = {"Authorization": f"Bearer {access}"}

    # Approving device starts a QR session and approves it -> raw refresh is
    # parked on the qr row for the paired device to pick up.
    start = auth_client.post("/api/v1/qr/start")
    assert start.status_code == 200, start.text
    qr_token = start.json()["qr_token"]

    approve = auth_client.post(
        "/api/v1/qr/approve", json={"qr_token": qr_token}, headers=auth_headers
    )
    assert approve.status_code == 200, approve.text

    parked = _qr_row(qr_token)
    assert parked is not None
    assert parked.refresh_token_raw, "approve must park the raw refresh for pickup"

    # Paired device polls once -> receives the refresh as an HttpOnly cookie and
    # the plaintext must be nulled immediately (one-time read).
    poll = auth_client.get("/api/v1/qr/poll", headers={"X-QR-Token": qr_token})
    assert poll.status_code == 200, poll.text
    assert poll.json()["status"] == "approved"
    assert auth_client.cookies.get("refresh_token"), "paired device must get refresh cookie"

    after = _qr_row(qr_token)
    assert after is not None
    assert after.refresh_token_raw is None, (
        "refresh_token_raw must be NULL after the first qr_poll — plaintext refresh "
        "token must not be left at rest in qr_sessions (fix-brief #1 regression)"
    )


def test_qr_poll_does_not_reissue_refresh_on_second_read(auth_client) -> None:
    access = _register_and_login(auth_client)
    auth_headers = {"Authorization": f"Bearer {access}"}

    qr_token = auth_client.post("/api/v1/qr/start").json()["qr_token"]
    auth_client.post(
        "/api/v1/qr/approve", json={"qr_token": qr_token}, headers=auth_headers
    )

    first = auth_client.get("/api/v1/qr/poll", headers={"X-QR-Token": qr_token})
    assert first.status_code == 200
    auth_client.cookies.clear()

    # A replayed poll must not hand out the refresh again: the plaintext is gone,
    # so no refresh cookie is set on the second read.
    second = auth_client.get("/api/v1/qr/poll", headers={"X-QR-Token": qr_token})
    assert second.status_code == 200
    assert _qr_row(qr_token).refresh_token_raw is None
    assert auth_client.cookies.get("refresh_token") is None, (
        "refresh must be a one-time read — a replayed qr_poll must not re-issue it"
    )
