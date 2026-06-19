"""LiveKit SFU integration: scoped join-token minting + webhook verification.

The SFU server (LiveKit) is a separate process. This service's only jobs are:

  1. Mint short-lived, per-user JOIN TOKENS scoped to a single room with explicit
     publish/subscribe grants — the SFU trusts these tokens (HS256, signed with the
     shared API secret) instead of re-authenticating users itself.
  2. Verify the SIGNED WEBHOOKS the SFU posts back (participant joined/left, room
     finished) so call state stays in sync without polling.

Implemented on PyJWT directly (no heavyweight livekit SDK) — the token format is a
stable, documented JWT contract, so this keeps the dependency surface small and the
behaviour fully unit-testable offline.
"""

from __future__ import annotations

import base64
import hashlib
import time
from typing import Any

import jwt
from app.core.config import settings


class LiveKitError(RuntimeError):
    """Raised when the SFU is not configured or a webhook fails verification."""


def is_enabled() -> bool:
    return settings.livekit_enabled


def mint_join_token(
    *,
    room: str,
    identity: str,
    display_name: str | None = None,
    can_publish: bool = True,
    can_subscribe: bool = True,
    can_publish_data: bool = True,
    ttl_seconds: int | None = None,
    metadata: str | None = None,
) -> tuple[str, int]:
    """Return ``(jwt, ttl_seconds)`` — a LiveKit access token granting ``identity``
    membership of ``room`` with the given media grants.

    The grant is intentionally narrow: a token is bound to exactly one room and one
    identity, so a leaked token cannot be replayed into another call.
    """
    if not settings.livekit_enabled:
        raise LiveKitError("LiveKit SFU is not configured")

    ttl = ttl_seconds or settings.livekit_token_ttl_seconds
    now = int(time.time())
    video_grant: dict[str, Any] = {
        "room": room,
        "roomJoin": True,
        "canPublish": can_publish,
        "canSubscribe": can_subscribe,
        "canPublishData": can_publish_data,
    }
    claims: dict[str, Any] = {
        "iss": settings.livekit_api_key,
        "sub": identity,
        "nbf": now,
        "exp": now + ttl,
        # LiveKit identifies the participant by `sub`; `name` is the display label.
        "video": video_grant,
    }
    if display_name:
        claims["name"] = display_name
    if metadata:
        claims["metadata"] = metadata

    token = jwt.encode(claims, settings.livekit_api_secret, algorithm="HS256")
    return token, ttl


def verify_webhook(*, body: bytes, auth_header: str | None) -> dict[str, Any]:
    """Validate a LiveKit webhook request and return the decoded event JSON.

    LiveKit signs each webhook by sending a JWT in the Authorization header whose
    ``sha256`` claim is the base64 SHA-256 of the raw request body. We verify the
    signature (with the shared API secret + expected issuer) AND that the body hash
    matches, so a forged body or a replayed-against-different-body token is rejected.
    """
    if not settings.livekit_enabled:
        raise LiveKitError("LiveKit SFU is not configured")
    if not auth_header:
        raise LiveKitError("missing webhook Authorization token")

    token = auth_header.split(" ", 1)[1].strip() if " " in auth_header else auth_header.strip()
    try:
        decoded = jwt.decode(
            token,
            settings.livekit_api_secret,
            algorithms=["HS256"],
            issuer=settings.livekit_api_key,
            options={"require": ["exp", "iss"]},
        )
    except jwt.PyJWTError as exc:  # signature / expiry / issuer mismatch
        raise LiveKitError(f"invalid webhook token: {exc}") from exc

    expected = decoded.get("sha256")
    actual = base64.b64encode(hashlib.sha256(body).digest()).decode("ascii")
    # Constant-time compare to avoid leaking the hash via timing.
    if not expected or not _consteq(str(expected), actual):
        raise LiveKitError("webhook body hash mismatch")

    import json

    return json.loads(body or b"{}")


def _consteq(a: str, b: str) -> bool:
    import hmac

    return hmac.compare_digest(a, b)
