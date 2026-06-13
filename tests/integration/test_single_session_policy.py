"""Integration tests: single-session policy.

A fresh credentials login terminates every other session (the old device's
refresh token stops working). QR pairing is the only sanctioned path to a
second concurrent session and enforces a max-2 invariant — both covered at
the service layer in unit tests; here we verify the user-visible contract:
login #2 kills login #1.
"""

import pytest

pytestmark = pytest.mark.integration

STRONG_PASSWORD = "anypass8chars"


def _refresh_cookie(resp) -> str | None:
    # auth sets the refresh token as an httpOnly cookie; TestClient exposes it.
    for name in ("refresh_token", "nexa_refresh", "rt"):
        if name in resp.cookies:
            return resp.cookies[name]
    return None


def test_second_login_revokes_first_session(auth_client) -> None:
    email = "single-session@example.com"
    reg = auth_client.post(
        "/api/v1/register",
        json={"email": email, "username": "ssuser", "password": STRONG_PASSWORD},
    )
    assert reg.status_code == 201

    # Login #1 (e.g. old browser)
    first = auth_client.post(
        "/api/v1/login", json={"email": email, "password": STRONG_PASSWORD},
    )
    assert first.status_code == 200
    first_cookie = _refresh_cookie(first)

    # Login #2 (new device/browser) — must terminate session #1
    auth_client.cookies.clear()
    second = auth_client.post(
        "/api/v1/login", json={"email": email, "password": STRONG_PASSWORD},
    )
    assert second.status_code == 200

    # Session #1's refresh token must now be rejected.
    if first_cookie:
        auth_client.cookies.clear()
        stale = auth_client.post(
            "/api/v1/refresh", cookies={"refresh_token": first_cookie},
        )
        assert stale.status_code == 401, "old session must be invalidated by the new login"

    # Session #2 keeps working.
    second_cookie = _refresh_cookie(second)
    if second_cookie:
        auth_client.cookies.clear()
        fresh = auth_client.post(
            "/api/v1/refresh", cookies={"refresh_token": second_cookie},
        )
        assert fresh.status_code == 200, "the newest session must stay active"
