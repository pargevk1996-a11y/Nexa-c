"""Redis-backed presence and typing state."""

from __future__ import annotations

import json
from dataclasses import dataclass

from redis.asyncio import Redis

from app.core.config import settings


@dataclass
class PresenceStore:
    redis: Redis

    def _presence_key(self, user_id: str) -> str:
        return f"nexa:presence:{user_id}"

    def _typing_key(self, conversation_id: str) -> str:
        return f"nexa:typing:{conversation_id}"

    async def set_online(self, user_id: str, *, is_online: bool, status_text: str | None = None) -> dict:
        data = {"user_id": user_id, "is_online": is_online, "status_text": status_text}
        if is_online:
            await self.redis.set(
                self._presence_key(user_id),
                json.dumps(data),
                ex=settings.presence_ttl_seconds,
            )
        else:
            await self.redis.delete(self._presence_key(user_id))
        return data

    async def get(self, user_id: str) -> dict | None:
        raw = await self.redis.get(self._presence_key(user_id))
        if not raw:
            return {"user_id": user_id, "is_online": False}
        return json.loads(raw)

    async def set_typing(self, user_id: str, conversation_id: str, is_typing: bool) -> list[str]:
        key = self._typing_key(conversation_id)
        if is_typing:
            await self.redis.sadd(key, user_id)
            await self.redis.expire(key, settings.typing_ttl_seconds)
        else:
            await self.redis.srem(key, user_id)
        members = await self.redis.smembers(key)
        return list(members)

    async def get_typing(self, conversation_id: str) -> list[str]:
        return list(await self.redis.smembers(self._typing_key(conversation_id)))
