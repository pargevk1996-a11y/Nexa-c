"""Fan-out presence/typing via Redis (same bus as chat)."""

from __future__ import annotations

import logging

from nexa_shared.realtime.bus import EventBus, fanout_event
from nexa_shared.realtime.events import RealtimeEvent
from nexa_shared.realtime.registry import ConnectionRegistry
from redis.asyncio import Redis

logger = logging.getLogger(__name__)


class PresencePublisher:
    def __init__(self, redis: Redis) -> None:
        self._bus = EventBus(redis)
        self._registry = ConnectionRegistry(redis)

    async def _fanout(self, event: RealtimeEvent) -> None:
        await fanout_event(self._bus, self._registry, event)

    async def broadcast_presence(self, user_id: str, data: dict) -> None:
        event = RealtimeEvent(
            name="presence.update",
            target_user_ids=[user_id],
            payload=data,
        )
        try:
            await self._fanout(event)
        except Exception:
            logger.exception("broadcast_presence failed")

    async def broadcast_typing(self, conversation_id: str, user_id: str, is_typing: bool) -> None:
        event = RealtimeEvent(
            name="typing.start" if is_typing else "typing.stop",
            target_user_ids=[],
            payload={"conversation_id": conversation_id, "user_id": user_id},
            conversation_id=conversation_id,
        )
        try:
            await self._fanout(event)
        except Exception:
            logger.exception("broadcast_typing failed")
