"""Integration tests: session-count invariants (fix-brief #7).

Locks in the single-session policy and the QR max-2 exception so a future
refactor cannot silently re-open multi-session sign-in:

  * a fresh credentials login leaves exactly ONE active session;
  * QR pairing leaves exactly TWO (approver + newly linked device);
  * a third device linked via QR still keeps at most TWO;
  * refresh-token reuse is detected and revokes the whole token family.
"""

import pytest

pytestmark = pytest.mark.integration

STRONG_PASSWORD = "anypass8chars"


def _refresh_from_jar(client) -> str | None:
    # The refresh cookie is scoped to Path=/api/v1/auth, so httpx hides it from
    # response.cookies; read it from the client cookie jar instead.
    return client.cookies.get("refresh_token")


def _register(client, email: str, username: str) -> None:
    reg = client.post(
        "/api/v1/register",
        json={"email": email, "username": username, "password": STRONG_PASSWORD},
    )
    assert reg.status_code == 201, reg.text


def _login(client):
    client.cookies.clear()
    resp = client.post(
        "/api/v1/login", json={"email": _login.email, "password": STRONG_PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return resp


def _active_session_count(client, access: str) -> int:
    resp = client.get(
        "/api/v1/sessions", headers={"Authorization": f"Bearer {access}"}
    )
    assert resp.status_code == 200, resp.text
    return len(resp.json())


def _link_via_qr(client, approver_access: str) -> None:
    """Run a full QR pairing as the approver identified by ``approver_access``."""
    token = client.post("/api/v1/qr/start").json()["qr_token"]
    approve = client.post(
        "/api/v1/qr/approve",
        json={"qr_token": token},
        headers={"Authorization": f"Bearer {approver_access}"},
    )
    assert approve.status_code == 200, approve.text
    poll = client.get("/api/v1/qr/poll", headers={"X-QR-Token": token})
    assert poll.status_code == 200 and poll.json()["status"] == "approved"


def test_normal_login_leaves_exactly_one_session(auth_client) -> None:
    _login.email = "policy-single@example.com"
    _register(auth_client, _login.email, "single")

    _login(auth_client)
    first_cookie = _refresh_from_jar(auth_client)  # capture before it's replaced
    assert first_cookie, "login must set a refresh cookie"

    second = _login(auth_client)  # single-session: must revoke the first
    access2 = second.json()["access_token"]

    assert _active_session_count(auth_client, access2) == 1, (
        "a fresh credentials login must terminate every other session"
    )
    # The first session's refresh token must be dead.
    auth_client.cookies.clear()
    stale = auth_client.post(
        "/api/v1/refresh", cookies={"refresh_token": first_cookie}
    )
    assert stale.status_code == 401


def test_qr_pairing_leaves_exactly_two_sessions(auth_client) -> None:
    _login.email = "policy-qr2@example.com"
    _register(auth_client, _login.email, "qrtwo")

    approver_access = _login(auth_client).json()["access_token"]
    assert _active_session_count(auth_client, approver_access) == 1

    _link_via_qr(auth_client, approver_access)
    assert _active_session_count(auth_client, approver_access) == 2, (
        "after QR pairing exactly two sessions stay active: approver + linked device"
    )


def test_third_qr_device_keeps_max_two(auth_client) -> None:
    _login.email = "policy-qr3@example.com"
    _register(auth_client, _login.email, "qrthree")

    approver_access = _login(auth_client).json()["access_token"]

    _link_via_qr(auth_client, approver_access)
    assert _active_session_count(auth_client, approver_access) == 2

    # A third device linked via QR must still respect the max-2 invariant: the
    # approver is kept, the previous linked device is revoked.
    _link_via_qr(auth_client, approver_access)
    assert _active_session_count(auth_client, approver_access) == 2, (
        "linking a third device via QR must not exceed two concurrent sessions"
    )


def test_refresh_reuse_on_revoked_session_is_detected(auth_client) -> None:
    # Reuse-detection path: a refresh token belonging to a session that was
    # revoked (here, by the single-session policy on a second login) must be
    # rejected specifically as REUSE — which triggers family revocation — rather
    # than passing silently or looking like a generic invalid token.
    _login.email = "policy-reuse@example.com"
    _register(auth_client, _login.email, "reuse")

    _login(auth_client)  # session A
    r1 = _refresh_from_jar(auth_client)
    assert r1, "login must set a refresh cookie"

    _login(auth_client)  # session B — single-session policy revokes session A

    auth_client.cookies.clear()
    replay = auth_client.post("/api/v1/refresh", cookies={"refresh_token": r1})
    assert replay.status_code == 401, "a revoked session's refresh must be rejected"
    # The custom exception handler returns {"error": {"code": ...}} (no "detail" wrap).
    code = replay.json().get("error", {}).get("code")
    assert code == "REFRESH_REUSE", (
        "replaying a revoked session's refresh must be detected as reuse (which "
        f"revokes the token family), got code={code!r}"
    )
