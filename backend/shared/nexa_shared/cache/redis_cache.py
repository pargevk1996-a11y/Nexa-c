"""Redis cache-aside layer for hot reads (sync, profiles, session hints)."""

from __future__ import annotations

import json
from typing import Any

from redis.asyncio import Redis


class RedisCache:
    def __init__(self, redis: Redis, *, prefix: str = "nexa:cache") -> None:
        self._redis = redis
        self._prefix = prefix

    def _key(self, key: str) -> str:
        return f"{self._prefix}:{key}"

    async def get(self, key: str) -> str | None:
        return await self._redis.get(self._key(key))

    async def get_json(self, key: str) -> Any | None:
        raw = await self.get(key)
        if raw is None:
            return None
        return json.loads(raw)

    async def set(self, key: str, value: str, *, ttl_seconds: int) -> None:
        await self._redis.set(self._key(key), value, ex=ttl_seconds)

    async def set_json(self, key: str, value: Any, *, ttl_seconds: int) -> None:
        await self.set(key, json.dumps(value, separators=(",", ":")), ttl_seconds=ttl_seconds)

    async def delete(self, key: str) -> None:
        await self._redis.delete(self._key(key))

    async def get_many_json(self, keys: list[str]) -> dict[str, Any]:
        if not keys:
            return {}
        full = [self._key(k) for k in keys]
        values = await self._redis.mget(full)
        out: dict[str, Any] = {}
        for k, raw in zip(keys, values, strict=True):
            if raw:
                out[k] = json.loads(raw)
        return out
