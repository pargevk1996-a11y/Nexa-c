"""Integration tests: login rate limits and account lock until password reset."""

import time

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def fast_login_protection(auth_client: object, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "login_first_lockout_seconds", 2)
    monkeypatch.setattr(settings, "login_retry_lockout_seconds", 2)
    monkeypatch.setattr(settings, "login_max_strikes", 2)


STRONG_PASSWORD = "anypass8chars"


def _register(auth_client, email: str, password: str = STRONG_PASSWORD) -> None:
    resp = auth_client.post(
        "/api/v1/register",
        json={"email": email, "username": "lockuser", "password": password},
    )
    assert resp.status_code in (200, 201)


def test_three_wrong_passwords_then_temporary_lock(auth_client) -> None:
    email = "lock3@example.com"
    _register(auth_client, email)
    for _ in range(2):
        resp = auth_client.post(
            "/api/v1/login",
            json={"email": email, "password": "wrong"},
        )
        assert resp.status_code == 401
    third = auth_client.post(
        "/api/v1/login",
        json={"email": email, "password": "wrong"},
    )
    assert third.status_code == 429
    assert third.json()["error"]["code"] == "ACCOUNT_LOCKED"
    locked = auth_client.post(
        "/api/v1/login",
        json={"email": email, "password": "wrong"},
    )
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "ACCOUNT_LOCKED"


def test_correct_password_blocked_while_temporarily_locked(auth_client) -> None:
    email = "lockok@example.com"
    password = "longpassword"
    _register(auth_client, email, password)
    for _ in range(3):
        auth_client.post("/api/v1/login", json={"email": email, "password": "wrong"})
    ok = auth_client.post("/api/v1/login", json={"email": email, "password": password})
    assert ok.status_code == 429


def test_account_locked_until_password_reset(auth_client) -> None:
    email = "resetlock@example.com"
    password = STRONG_PASSWORD
    new_password = "newpass8chars"
    _register(auth_client, email, password)

    def exhaust_cycle() -> None:
        for _ in range(3):
            auth_client.post("/api/v1/login", json={"email": email, "password": "wrong"})
        time.sleep(2.1)
        auth_client.post("/api/v1/login", json={"email": email, "password": "wrong"})
        time.sleep(2.1)

    exhaust_cycle()
    exhaust_cycle()

    blocked = auth_client.post(
        "/api/v1/login",
        json={"email": email, "password": password},
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "PASSWORD_RESET_REQUIRED"

    forgot = auth_client.post("/api/v1/forgot-password", json={"email": email})
    assert forgot.status_code == 200
    token = forgot.json()["message"].split("token=")[-1]
    reset = auth_client.post(
        "/api/v1/reset-password",
        json={"token": token, "password": new_password},
    )
    assert reset.status_code == 200

    login = auth_client.post(
        "/api/v1/login",
        json={"email": email, "password": new_password},
    )
    assert login.status_code == 200
