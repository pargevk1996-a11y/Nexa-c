"""HTTP clients for calling chat-service and notification-service."""

from __future__ import annotations

import logging

import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


async def create_dm_conversation(from_user_id: str, to_user_id: str, *, token: str) -> str | None:
    """Create a locked DM conversation via chat-service. Returns conversation_id."""
    url = f"{settings.chat_service_url.rstrip('/')}/api/v1/conversations"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                url,
                json={"type": "dm", "member_ids": [to_user_id], "locked_for": to_user_id},
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code in (200, 201):
                conv_id = resp.json().get("id")
                logger.info("Created DM conversation %s for users %s↔%s", conv_id, from_user_id, to_user_id)
                return conv_id
            logger.warning("create_dm_conversation got %s: %s", resp.status_code, resp.text[:200])
    except Exception:
        logger.warning("create_dm_conversation failed", exc_info=True)
    return None


async def unlock_conversation(conversation_id: str) -> None:
    """Unlock a conversation (remove content lock) via chat-service internal endpoint."""
    url = f"{settings.chat_service_url.rstrip('/')}/api/v1/conversations/{conversation_id}/unlock"
    secret = settings.internal_service_secret
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.patch(url, headers={"X-Internal-Secret": secret})
            if resp.status_code not in (200, 204):
                logger.warning("unlock_conversation %s got %s: %s", conversation_id, resp.status_code, resp.text[:200])
    except Exception:
        logger.warning("unlock_conversation failed for %s", conversation_id, exc_info=True)


async def delete_dm_conversation(conversation_id: str) -> None:
    """Delete/archive a conversation via chat-service internal endpoint."""
    url = f"{settings.chat_service_url.rstrip('/')}/api/v1/conversations/{conversation_id}/archive"
    secret = settings.internal_service_secret
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.patch(url, headers={"X-Internal-Secret": secret})
            if resp.status_code not in (200, 204):
                logger.warning("delete_dm_conversation %s got %s: %s", conversation_id, resp.status_code, resp.text[:200])
    except Exception:
        logger.warning("delete_dm_conversation failed for %s", conversation_id, exc_info=True)


async def dispatch_contact_request_notification(
    *,
    from_user_id: str,
    from_username: str,
    to_user_id: str,
    request_id: str,
) -> None:
    """Send push notification to the request recipient."""
    base = settings.notification_service_url.strip()
    if not base:
        return
    url = f"{base.rstrip('/')}/api/v1/notifications/internal/dispatch-contact-request"
    secret = settings.internal_service_secret
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                url,
                json={
                    "from_user_id": from_user_id,
                    "from_username": from_username,
                    "to_user_id": to_user_id,
                    "request_id": request_id,
                },
                headers={"X-Internal-Secret": secret},
            )
    except Exception:
        logger.debug("contact_request notification dispatch skipped", exc_info=True)
