"""Integration tests: auth register and login."""

import pytest

pytestmark = pytest.mark.integration

STRONG_PASSWORD = "anypass8chars"


def test_register_and_login(auth_client) -> None:
    email = "integration@example.com"
    reg = auth_client.post(
        "/api/v1/register",
        json={"email": email, "username": "intuser", "password": STRONG_PASSWORD},
    )
    assert reg.status_code == 201

    login = auth_client.post(
        "/api/v1/login",
        json={"email": email, "password": STRONG_PASSWORD},
    )
    assert login.status_code == 200
    body = login.json()
    assert body.get("access_token")
    assert body["user"]["email"] == email


def test_login_invalid_password(auth_client) -> None:
    email = "badlogin@example.com"
    auth_client.post(
        "/api/v1/register",
        json={"email": email, "username": "baduser", "password": STRONG_PASSWORD},
    )
    login = auth_client.post(
        "/api/v1/login",
        json={"email": email, "password": "WrongPass1!"},
    )
    assert login.status_code == 401
    assert login.json()["error"]["code"] == "INVALID_CREDENTIALS"
