"""Redis-backed WebSocket connection registry for horizontal scaling."""

from __future__ import annotations

from dataclasses import dataclass

from redis.asyncio import Redis


@dataclass
class ConnectionRecord:
    user_id: str
    node_id: str
    conn_id: str


def _member(node_id: str, conn_id: str) -> str:
    return f"{node_id}:{conn_id}"


class ConnectionRegistry:
    """Maps user_id → one or more {node_id, conn_id} for horizontal WS fan-out."""

    def __init__(self, redis: Redis, *, prefix: str = "nexa:ws:conns") -> None:
        self._redis = redis
        self._prefix = prefix

    def _key(self, user_id: str) -> str:
        return f"{self._prefix}:{user_id}"

    async def register(
        self,
        user_id: str,
        *,
        node_id: str,
        conn_id: str,
        ttl_seconds: int = 120,
    ) -> None:
        key = self._key(user_id)
        await self._redis.sadd(key, _member(node_id, conn_id))
        await self._redis.expire(key, ttl_seconds)

    async def refresh(self, user_id: str, *, ttl_seconds: int = 120) -> None:
        await self._redis.expire(self._key(user_id), ttl_seconds)

    async def unregister(
        self,
        user_id: str,
        *,
        node_id: str | None = None,
        conn_id: str | None = None,
    ) -> None:
        key = self._key(user_id)
        if node_id and conn_id:
            await self._redis.srem(key, _member(node_id, conn_id))
            if await self._redis.scard(key) == 0:
                await self._redis.delete(key)
            return
        await self._redis.delete(key)

    def _parse_member(self, user_id: str, member: str) -> ConnectionRecord | None:
        if ":" not in member:
            return None
        node_id, conn_id = member.split(":", 1)
        return ConnectionRecord(user_id=user_id, node_id=node_id, conn_id=conn_id)

    async def lookup(self, user_id: str) -> ConnectionRecord | None:
        recs = await self.lookup_many([user_id])
        items = recs.get(user_id) or []
        return items[0] if items else None

    async def lookup_many(self, user_ids: list[str]) -> dict[str, list[ConnectionRecord]]:
        if not user_ids:
            return {}
        pipe = self._redis.pipeline()
        for uid in user_ids:
            pipe.smembers(self._key(uid))
        results = await pipe.execute()
        out: dict[str, list[ConnectionRecord]] = {}
        for uid, members in zip(user_ids, results, strict=True):
            recs: list[ConnectionRecord] = []
            for m in members or []:
                if isinstance(m, bytes):
                    m = m.decode()
                rec = self._parse_member(uid, str(m))
                if rec:
                    recs.append(rec)
            if recs:
                out[uid] = recs
        return out
