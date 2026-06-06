"""Optional AI moderation client for chat-service."""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings
from app.services.moderation_engine import ModVerdict

logger = logging.getLogger(__name__)


async def maybe_ai_moderate(body: str, user_id: str) -> ModVerdict | None:
    if not settings.ai_moderation_enabled or not settings.ai_service_url:
        return None
    base = settings.ai_service_url.rstrip("/")
    headers = {
        "X-Internal-Secret": settings.internal_service_secret,
        "X-User-Id": user_id,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.ai_request_timeout_seconds) as client:
            mod = await client.post(f"{base}/api/v1/moderate", json={"text": body}, headers=headers)
            spam = await client.post(
                f"{base}/api/v1/spam/score",
                json={"text": body, "sender_id": user_id},
                headers=headers,
            )
        if mod.status_code != 200 or spam.status_code != 200:
            return None
        mod_body = mod.json()
        spam_body = spam.json()
        if not mod_body.get("allowed", True):
            return ModVerdict(
                False,
                "AI_MOD_BLOCKED",
                mod_body.get("reason") or "Message blocked by AI moderation",
                auto_flagged=True,
            )
        if spam_body.get("is_spam"):
            return ModVerdict(
                False,
                "AI_SPAM",
                "Message flagged as spam",
                auto_flagged=True,
            )
    except Exception as exc:
        logger.debug("AI moderation unavailable: %s", exc)
    return None
