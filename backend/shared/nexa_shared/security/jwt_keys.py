"""JWT signing with HS256 or RS256."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from nexa_shared.security.jwt import decode_token, encode_token


def load_pem(path: str | None, inline: str | None) -> str | None:
    if inline and inline.strip():
        return inline.replace("\\n", "\n").strip()
    if path and Path(path).is_file():
        return Path(path).read_text(encoding="utf-8")
    return None


def _previous_public_keys() -> list[str]:
    """PEM public keys from a PREVIOUS signing keypair, for graceful rollover.

    During a key rotation window, verifiers must accept tokens signed by BOTH the
    new key and the still-valid old key. This is read from the environment so it
    applies to every service uniformly without per-service config changes. After
    one access-token lifetime the operator unsets these vars to fully invalidate
    the old (leaked) tokens.
    """
    out: list[str] = []
    inline = os.environ.get("JWT_ACCESS_PUBLIC_KEY_PREVIOUS", "")
    if inline.strip():
        out.append(inline.replace("\\n", "\n").strip())
    path = os.environ.get("JWT_ACCESS_PUBLIC_KEY_PREVIOUS_FILE", "")
    if path and Path(path).is_file():
        out.append(Path(path).read_text(encoding="utf-8"))
    return out


def _previous_hs_secrets() -> list[str]:
    secret = os.environ.get("JWT_ACCESS_SECRET_PREVIOUS", "")
    return [secret] if secret.strip() else []


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
    # Build the ordered list of acceptable verification keys: the current key
    # first, then any previous-key material for the rollover window.
    if algorithm.startswith("RS"):
        candidates = [k for k in [public_key_pem, *_previous_public_keys()] if k]
        if not candidates:
            raise ValueError("RS256 requires JWT_ACCESS_PUBLIC_KEY")
    else:
        candidates = [s for s in [hs_secret, *_previous_hs_secrets()] if s]
        if not candidates:
            raise ValueError("HS256 requires JWT_ACCESS_SECRET")

    last_exc: Exception | None = None
    for secret in candidates:
        try:
            data = decode_token(token, secret=secret, algorithm=algorithm)
        except Exception as exc:  # signature/expiry mismatch — try the next key
            last_exc = exc
            continue
        if data.get("typ") != "access":
            raise ValueError("invalid token type")
        return data
    raise last_exc if last_exc else ValueError("token verification failed")
