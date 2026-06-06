"""In-process connection registry when Redis is unavailable (local dev)."""

from __future__ import annotations

from nexa_shared.realtime.registry import ConnectionRecord


class LocalConnectionRegistry:
    """Maps user_id → node/conn list for single-node dev without Redis."""

    def __init__(self) -> None:
        self._records: dict[str, list[ConnectionRecord]] = {}

    async def register(
        self,
        user_id: str,
        *,
        node_id: str,
        conn_id: str,
        ttl_seconds: int = 120,
    ) -> None:
        del ttl_seconds
        rec = ConnectionRecord(user_id=user_id, node_id=node_id, conn_id=conn_id)
        bucket = self._records.setdefault(user_id, [])
        bucket[:] = [r for r in bucket if r.conn_id != conn_id]
        bucket.append(rec)

    async def refresh(self, user_id: str, *, ttl_seconds: int = 120) -> None:
        del ttl_seconds
        if user_id not in self._records:
            return

    async def unregister(
        self,
        user_id: str,
        *,
        node_id: str | None = None,
        conn_id: str | None = None,
    ) -> None:
        if node_id and conn_id:
            bucket = self._records.get(user_id, [])
            self._records[user_id] = [
                r for r in bucket if not (r.node_id == node_id and r.conn_id == conn_id)
            ]
            if not self._records[user_id]:
                del self._records[user_id]
            return
        self._records.pop(user_id, None)

    async def lookup(self, user_id: str) -> ConnectionRecord | None:
        recs = await self.lookup_many([user_id])
        items = recs.get(user_id) or []
        return items[0] if items else None

    async def lookup_many(self, user_ids: list[str]) -> dict[str, list[ConnectionRecord]]:
        return {uid: list(self._records[uid]) for uid in user_ids if uid in self._records}
