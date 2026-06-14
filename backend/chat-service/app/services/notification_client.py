"""Fire-and-forget dispatch to notification-service."""

from __future__ import annotations

import logging
import re

import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

_MENTION_RE = re.compile(r"@([a-zA-Z0-9_]{2,32})")


def extract_mention_tokens(body: str) -> list[str]:
    return _MENTION_RE.findall(body or "")


async def dispatch_push_for_message(
    *,
    conversation_id: str,
    message_id: str,
    sender_id: str,
    sender_name: str,
    body_preview: str,
    silent: bool,
    target_user_ids: list[str],
    conversation_title: str | None = None,
    mention_user_ids: list[str] | None = None,
) -> None:
    base = (settings.notification_service_url or "").strip()
    if not base or not target_user_ids:
        return
    url = f"{base.rstrip('/')}/api/v1/notifications/internal/dispatch"
    payload = {
        "conversation_id": conversation_id,
        "message_id": message_id,
        "sender_id": sender_id,
        "sender_name": sender_name,
        "body_preview": body_preview[:500],
        "silent": silent,
        "mention_user_ids": mention_user_ids or extract_mention_tokens(body_preview),
        "target_user_ids": target_user_ids,
        "conversation_title": conversation_title,
    }
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                url,
                json=payload,
                headers={"X-Internal-Secret": settings.internal_service_secret},
            )
    except Exception:
        logger.debug("notification dispatch skipped", exc_info=True)
