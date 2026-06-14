"""HTTP client to chat-service for message persistence."""

from __future__ import annotations

from typing import Any

import httpx
from app.core.config import settings


class ChatClient:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(base_url=settings.chat_service_url, timeout=15.0)

    async def close(self) -> None:
        await self._client.aclose()

    async def send_message(
        self,
        *,
        access_token: str,
        conversation_id: str,
        client_msg_id: str,
        body: str,
        content_type: str = "text",
        reply_to_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "client_msg_id": client_msg_id,
            "body": body,
            "content_type": content_type,
        }
        if reply_to_id:
            payload["reply_to_id"] = reply_to_id
        r = await self._client.post(
            f"/api/v1/conversations/{conversation_id}/messages",
            headers={"Authorization": f"Bearer {access_token}"},
            json=payload,
        )
        r.raise_for_status()
        return r.json()

    async def sync_messages(
        self,
        *,
        access_token: str,
        conversation_id: str,
        after_seq: int,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        r = await self._client.get(
            f"/api/v1/conversations/{conversation_id}/messages",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"after_seq": after_seq, "limit": limit},
        )
        r.raise_for_status()
        return r.json()
