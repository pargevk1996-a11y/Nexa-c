"""Time-limited TURN credentials (coturn use-auth-secret)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import time

from app.core.config import settings


def build_ice_servers(user_id: str) -> list[dict]:
    servers: list[dict] = [{"urls": settings.stun_url_list}] if settings.stun_url_list else []

    if settings.turn_url_list and settings.turn_secret:
        expiry = int(time.time()) + settings.turn_ttl_seconds
        username = f"{expiry}:{settings.turn_username_prefix}:{user_id}"
        digest = hmac.new(
            settings.turn_secret.encode("utf-8"),
            username.encode("utf-8"),
            hashlib.sha1,
        ).digest()
        password = base64.b64encode(digest).decode("ascii")
        servers.append(
            {
                "urls": settings.turn_url_list,
                "username": username,
                "credential": password,
            }
        )
    elif settings.turn_url_list:
        servers.append({"urls": settings.turn_url_list})

    return servers
