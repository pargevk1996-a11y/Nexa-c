"""Publish chat events to Redis (fan-out) and NATS JetStream (durable delivery)."""

from __future__ import annotations

import logging
from typing import Any

from redis.asyncio import Redis

from app.core.config import settings
from app.services.chat_store import chat_store
from app.services.nats_publisher import init_nats, close_nats, publish_to_nats
from nexa_shared.realtime.bus import EventBus, fanout_event
from nexa_shared.realtime.events import RealtimeEvent
from nexa_shared.realtime.registry import ConnectionRegistry

logger = logging.getLogger(__name__)

_redis: Redis | None = None
_bus: EventBus | None = None
_registry: ConnectionRegistry | None = None


async def init_publisher() -> None:
    global _redis, _bus, _registry
    if _redis is not None:
        return
    try:
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
        await _redis.ping()
        _bus = EventBus(_redis)
        _registry = ConnectionRegistry(_redis)
    except Exception:
        logger.warning("Redis unavailable — realtime events disabled")
        _redis = None
    if settings.nats_url:
        await init_nats(settings.nats_url)


async def close_publisher() -> None:
    global _redis, _bus, _registry
    if _redis:
        await _redis.aclose()
    _redis = None
    _bus = None
    _registry = None
    await close_nats()


async def _member_ids(conversation_id: str, exclude: str | None = None) -> list[str]:
    return await chat_store.get_member_ids(conversation_id, exclude=exclude)


async def publish_message_event(
    *,
    name: str,
    conversation_id: str,
    payload: dict[str, Any],
    sender_id: str | None = None,
) -> None:
    if not _bus or not _registry:
        return
    targets = await _member_ids(conversation_id, exclude=sender_id)
    if not targets:
        return
    event = RealtimeEvent(
        name=name,
        target_user_ids=targets,
        payload=payload,
        conversation_id=conversation_id,
    )
    try:
        offline = await fanout_event(_bus, _registry, event)
        if offline and _bus:
            await _bus.enqueue_retry(
                {
                    "name": name,
                    "conversation_id": conversation_id,
                    "target_user_ids": offline,
                    "payload": payload,
                }
            )
    except Exception:
        logger.exception("publish_message_event failed")

    # Publish to NATS JetStream for durable delivery (ws-gateway consumer)
    await publish_to_nats(
        event_name=name,
        conversation_id=conversation_id,
        payload=payload,
        sender_id=sender_id,
    )
