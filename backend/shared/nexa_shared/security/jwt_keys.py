"""JWT signing with HS256 or RS256."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import jwt
from jwt import PyJWKClient

from nexa_shared.security.jwt import decode_token, encode_token


def load_pem(path: str | None, inline: str | None) -> str | None:
    if inline and inline.strip():
        return inline.replace("\\n", "\n").strip()
    if path and Path(path).is_file():
        return Path(path).read_text(encoding="utf-8")
    return None


def create_access_token(
    payload: dict[str, Any],
    *,
    algorithm: str,
    expires_seconds: int,
    hs_secret: str | None = None,
    private_key_pem: str | None = None,
) -> str:
    if algorithm.startswith("RS"):
        if not private_key_pem:
            raise ValueError("RS256 requires JWT_ACCESS_PRIVATE_KEY")
        return encode_token(
            payload,
            secret=private_key_pem,
            algorithm=algorithm,
            expires_seconds=expires_seconds,
        )
    if not hs_secret:
        raise ValueError("HS256 requires JWT_ACCESS_SECRET")
    return encode_token(
        payload,
        secret=hs_secret,
        algorithm=algorithm,
        expires_seconds=expires_seconds,
    )


def verify_access_token(
    token: str,
    *,
    algorithm: str,
    hs_secret: str | None = None,
    public_key_pem: str | None = None,
) -> dict[str, Any]:
    if algorithm.startswith("RS"):
        if not public_key_pem:
            raise ValueError("RS256 requires JWT_ACCESS_PUBLIC_KEY")
        secret: str = public_key_pem
    else:
        if not hs_secret:
            raise ValueError("HS256 requires JWT_ACCESS_SECRET")
        secret = hs_secret
    data = decode_token(token, secret=secret, algorithm=algorithm)
    if data.get("typ") != "access":
        raise ValueError("invalid token type")
    return data
