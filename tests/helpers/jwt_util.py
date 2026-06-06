"""JWT helpers for integration and WebSocket tests."""

from __future__ import annotations

from securechat_shared.security.jwt_keys import create_access_token

TEST_JWT_SECRET = "test-jwt-secret-for-pytest-only"
TEST_USER_ID = "test-user-001"


def make_access_token(
    *,
    user_id: str = TEST_USER_ID,
    secret: str = TEST_JWT_SECRET,
    email: str = "test@example.com",
    session_id: str = "sess-test",
    ttl: int = 3600,
) -> str:
    return create_access_token(
        {
            "sub": user_id,
            "sid": session_id,
            "email": email,
            "typ": "access",
        },
        algorithm="HS256",
        expires_seconds=ttl,
        hs_secret=secret,
    )


def auth_header(token: str | None = None) -> dict[str, str]:
    t = token or make_access_token()
    return {"Authorization": f"Bearer {t}"}
