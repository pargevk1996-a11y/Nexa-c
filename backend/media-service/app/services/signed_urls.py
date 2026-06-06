"""HMAC-signed URLs for secure CDN-style delivery."""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Literal

from app.core.config import settings

Purpose = Literal["stream", "preview", "download"]


def _sign(payload: str) -> str:
    sig = hmac.new(
        settings.media_signing_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(sig).decode("ascii").rstrip("=")


def create_signed_token(
    media_id: str,
    user_id: str,
    *,
    purpose: Purpose = "stream",
    ttl_seconds: int | None = None,
) -> str:
    ttl = ttl_seconds or settings.signed_url_ttl_seconds
    exp = int(time.time()) + ttl
    body = f"{media_id}|{user_id}|{purpose}|{exp}"
    sig = _sign(body)
    raw = f"{body}|{sig}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")


def verify_signed_token(token: str, *, media_id: str, purpose: Purpose) -> str | None:
    try:
        pad = "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(token + pad).decode("utf-8")
        parts = raw.split("|")
        if len(parts) != 5:
            return None
        mid, uid, purp, exp_s, sig = parts
        if mid != media_id or purp != purpose:
            return None
        if int(exp_s) < time.time():
            return None
        body = f"{mid}|{uid}|{purp}|{exp_s}"
        if not hmac.compare_digest(_sign(body), sig):
            return None
        return uid
    except Exception:
        return None


def build_cdn_url(media_id: str, token: str, *, purpose: Purpose = "stream") -> str:
    base = settings.cdn_public_base_url.rstrip("/")
    if purpose == "preview":
        return f"{base}/{media_id}/preview?sig={token}"
    if purpose == "download":
        return f"{base}/{media_id}/download?sig={token}"
    return f"{base}/{media_id}/stream?sig={token}"
