from datetime import UTC, datetime, timedelta
from typing import Any

import jwt


def encode_token(
    payload: dict[str, Any],
    *,
    secret: str,
    algorithm: str = "HS256",
    expires_seconds: int = 900,
) -> str:
    data = payload.copy()
    data["exp"] = datetime.now(UTC) + timedelta(seconds=expires_seconds)
    data["iat"] = datetime.now(UTC)
    return jwt.encode(data, secret, algorithm=algorithm)


def decode_token(
    token: str,
    *,
    secret: str,
    algorithm: str = "HS256",
) -> dict[str, Any]:
    return jwt.decode(token, secret, algorithms=[algorithm])
