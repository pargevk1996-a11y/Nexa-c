"""Publish call signaling events to WS gateway via Redis."""

from __future__ import annotations

import logging
from typing import Any

from nexa_shared.realtime.bus import EventBus, fanout_event
from nexa_shared.realtime.events import RealtimeEvent
from nexa_shared.realtime.registry import ConnectionRegistry
from redis.asyncio import Redis

logger = logging.getLogger(__name__)

_redis: Redis | None = None
_bus: EventBus | None = None
_registry: ConnectionRegistry | None = None


async def init_publisher(redis_url: str) -> None:
    global _redis, _bus, _registry
    try:
        _redis = Redis.from_url(redis_url, decode_responses=True)
        await _redis.ping()
        _bus = EventBus(_redis)
        _registry = ConnectionRegistry(_redis)
    except Exception:
        logger.warning("Redis unavailable — call WS notify disabled")
        _redis = None


async def close_publisher() -> None:
    global _redis, _bus, _registry
    if _redis:
        await _redis.aclose()
    _redis = None
    _bus = None
    _registry = None


async def notify_users(
    *,
    event_name: str,
    target_user_ids: list[str],
    payload: dict[str, Any],
    exclude_user_id: str | None = None,
) -> None:
    if not _bus or not _registry:
        return
    targets = [uid for uid in target_user_ids if uid != exclude_user_id]
    if not targets:
        return
    event = RealtimeEvent(name=event_name, target_user_ids=targets, payload=payload)
    try:
        await fanout_event(_bus, _registry, event)
    except Exception:
        logger.exception("notify_users failed")
