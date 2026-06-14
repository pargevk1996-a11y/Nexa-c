"""Security tests: auth boundaries, password policy, token validation."""

import pytest
from tests.helpers.api import api_error
from tests.helpers.jwt_util import auth_header

pytestmark = pytest.mark.security


def test_protected_route_requires_bearer(contact_client) -> None:
    resp = contact_client.get("/api/v1/contacts/blocks")
    assert resp.status_code == 401
    assert api_error(resp.json())["code"] == "UNAUTHORIZED"


def test_invalid_bearer_rejected(contact_client) -> None:
    resp = contact_client.get(
        "/api/v1/contacts/blocks",
        headers={"Authorization": "Bearer invalid.token.here"},
    )
    assert resp.status_code == 401
    assert api_error(resp.json())["code"] == "INVALID_TOKEN"


def test_weak_password_rejected_on_register(auth_client) -> None:
    resp = auth_client.post(
        "/api/v1/register",
        json={
            "email": "weak@example.com",
            "username": "weakuser",
            "password": "short",
        },
    )
    assert resp.status_code in (400, 422)
    if resp.status_code == 400:
        assert api_error(resp.json())["code"] == "PASSWORD_TOO_WEAK"


def test_sql_injection_in_email_does_not_crash(auth_client) -> None:
    resp = auth_client.post(
        "/api/v1/login",
        json={"email": "not-a-real-user@example.com", "password": "' OR 1=1 --"},
    )
    assert resp.status_code in (401, 422, 429)
    if resp.status_code == 401:
        assert api_error(resp.json())["code"] == "INVALID_CREDENTIALS"


def test_token_type_must_be_access(contact_client) -> None:
    from nexa_shared.security.jwt_keys import create_access_token

    refresh_like = create_access_token(
        {"sub": "u1", "typ": "refresh"},
        algorithm="HS256",
        expires_seconds=300,
        hs_secret="test-jwt-secret-for-pytest-only",
    )
    resp = contact_client.get("/api/v1/contacts/blocks", headers=auth_header(refresh_like))
    assert resp.status_code == 401
