"""Integration test: WebAuthn is gated off by default (fix-brief #5).

The WebAuthn ceremony is still a stub, so in the default (production) config the
endpoints must behave as if they don't exist and /me/security must advertise the
feature as unavailable — so the frontend hides the dead-end passkey option.
"""

import pytest

pytestmark = pytest.mark.integration

STRONG_PASSWORD = "anypass8chars"


def _auth(client) -> dict:
    email = "webauthn-flag@example.com"
    client.post(
        "/api/v1/register",
        json={"email": email, "username": "wauser", "password": STRONG_PASSWORD},
    )
    client.cookies.clear()
    access = client.post(
        "/api/v1/login", json={"email": email, "password": STRONG_PASSWORD}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {access}"}


def test_webauthn_endpoints_hidden_when_disabled(auth_client) -> None:
    headers = _auth(auth_client)

    register = auth_client.post(
        "/api/v1/webauthn/register",
        json={"credential_id": "abc", "public_key": "pk"},
        headers=headers,
    )
    assert register.status_code == 404, "stub WebAuthn must be hidden in default config"

    listing = auth_client.get("/api/v1/webauthn/credentials", headers=headers)
    assert listing.status_code == 404

    start = auth_client.post(
        "/api/v1/webauthn/login/start", json={"email": "webauthn-flag@example.com"}
    )
    assert start.status_code == 404


def test_security_status_reports_webauthn_disabled(auth_client) -> None:
    headers = _auth(auth_client)
    status = auth_client.get("/api/v1/me/security", headers=headers)
    assert status.status_code == 200, status.text
    assert status.json()["webauthn_enabled"] is False
