"""Unit tests: JWT create and verify."""

import pytest
from securechat_shared.security.jwt_keys import create_access_token, verify_access_token

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
