"""Unit tests: JWT create and verify."""

import pytest
from nexa_shared.security.jwt_keys import create_access_token, verify_access_token

pytestmark = pytest.mark.unit


def test_hs256_roundtrip() -> None:
    secret = "unit-test-secret"
    token = create_access_token(
        {"sub": "u1", "typ": "access", "email": "a@b.co"},
        algorithm="HS256",
        expires_seconds=300,
        hs_secret=secret,
    )
    claims = verify_access_token(token, algorithm="HS256", hs_secret=secret)
    assert claims["sub"] == "u1"
    assert claims["typ"] == "access"


def test_wrong_secret_fails() -> None:
    token = create_access_token(
        {"sub": "u1", "typ": "access"},
        algorithm="HS256",
        expires_seconds=300,
        hs_secret="secret-a",
    )
    with pytest.raises(Exception):
        verify_access_token(token, algorithm="HS256", hs_secret="secret-b")


def test_graceful_rollover_accepts_previous_secret(monkeypatch) -> None:
    """During rotation, a token signed by the OLD key still verifies while the
    new key is primary and the old key is configured as the previous one."""
    old_secret = "old-signing-secret"
    new_secret = "new-signing-secret"
    token = create_access_token(
        {"sub": "u1", "typ": "access"},
        algorithm="HS256",
        expires_seconds=300,
        hs_secret=old_secret,
    )
    # Primary key is the new one; old key offered as the rollover fallback.
    monkeypatch.setenv("JWT_ACCESS_SECRET_PREVIOUS", old_secret)
    claims = verify_access_token(token, algorithm="HS256", hs_secret=new_secret)
    assert claims["sub"] == "u1"

    # After the window the previous key is removed → old token is rejected.
    monkeypatch.delenv("JWT_ACCESS_SECRET_PREVIOUS", raising=False)
    with pytest.raises(Exception):
        verify_access_token(token, algorithm="HS256", hs_secret=new_secret)
