"""Blocked users store — in-memory default, swapped to Postgres in lifespan."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass
class BlockRecord:
    owner_id: str
    blocked_user_id: str
    reason: str | None
    blocked_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class BlockStore:
    _blocks: dict[tuple[str, str], BlockRecord] = field(default_factory=dict)

    async def block(self, owner_id: str, blocked_user_id: str, *, reason: str | None = None) -> BlockRecord:
        if owner_id == blocked_user_id:
            raise ValueError("SELF_BLOCK")
        rec = BlockRecord(owner_id=owner_id, blocked_user_id=blocked_user_id, reason=reason)
        self._blocks[(owner_id, blocked_user_id)] = rec
        return rec

    async def unblock(self, owner_id: str, blocked_user_id: str) -> bool:
        return self._blocks.pop((owner_id, blocked_user_id), None) is not None

    async def list_blocks(self, owner_id: str) -> list[BlockRecord]:
        return sorted(
            [b for b in self._blocks.values() if b.owner_id == owner_id],
            key=lambda x: x.blocked_at,
            reverse=True,
        )

    async def is_blocked(self, owner_id: str, other_id: str) -> bool:
        return (owner_id, other_id) in self._blocks


class _BlockStoreProxy:
    """Starts in-memory; call _switch_to_postgres() in lifespan to use Postgres."""

    def __init__(self) -> None:
        self._impl: BlockStore = BlockStore()

    def _switch_to_postgres(self, pg) -> None:
        self._impl = pg

    def __getattr__(self, name: str):
        return getattr(self._impl, name)


block_store = _BlockStoreProxy()
