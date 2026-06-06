"""Short-TTL Redis cache for conversation sync (reduces hot read load)."""

from __future__ import annotations

import hashlib
from typing import Any

from app.core.redis import get_redis
from nexa_shared.cache import RedisCache

_CACHE: RedisCache | None = None
_TTL_SECONDS = 3


async def _cache() -> RedisCache | None:
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    try:
        redis = await get_redis()
        await redis.ping()
        _CACHE = RedisCache(redis, prefix="nexa:sync")
        return _CACHE
    except Exception:
        return None


def _key(conversation_id: str, user_id: str, after_seq: int) -> str:
    raw = f"{conversation_id}:{user_id}:{after_seq}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def get_cached_sync(
    conversation_id: str,
    user_id: str,
    after_seq: int,
) -> dict[str, Any] | None:
    layer = await _cache()
    if not layer:
        return None
    return await layer.get_json(_key(conversation_id, user_id, after_seq))


async def set_cached_sync(
    conversation_id: str,
    user_id: str,
    after_seq: int,
    payload: dict[str, Any],
) -> None:
    layer = await _cache()
    if not layer:
        return
    await layer.set_json(
        _key(conversation_id, user_id, after_seq),
        payload,
        ttl_seconds=_TTL_SECONDS,
    )


async def invalidate_conversation(conversation_id: str) -> None:
    """Best-effort: sync keys are hashed; new writes rely on short TTL."""
    del conversation_id
