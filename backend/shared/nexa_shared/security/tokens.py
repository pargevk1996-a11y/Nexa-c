"""JWT access tokens and opaque refresh token helpers."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from nexa_shared.security.jwt import decode_token, encode_token


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def new_session_id() -> str:
    return str(uuid4())


def create_access_token(
    *,
    user_id: str,
    session_id: str,
    email: str,
    secret: str,
    algorithm: str = "HS256",
    expires_seconds: int = 900,
    extra: dict[str, Any] | None = None,
) -> str:
    payload: dict[str, Any] = {
        "sub": user_id,
        "sid": session_id,
        "email": email,
        "typ": "access",
    }
    if extra:
        payload.update(extra)
    return encode_token(payload, secret=secret, algorithm=algorithm, expires_seconds=expires_seconds)


def decode_access_token(
    token: str,
    *,
    secret: str,
    algorithm: str = "HS256",
) -> dict[str, Any]:
    data = decode_token(token, secret=secret, algorithm=algorithm)
    if data.get("typ") != "access":
        raise ValueError("invalid token type")
    return data


def expires_at_from_ttl(seconds: int) -> datetime:
    return datetime.now(UTC) + timedelta(seconds=seconds)
