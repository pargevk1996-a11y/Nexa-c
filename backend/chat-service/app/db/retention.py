"""Retention policy jobs (call from cron / worker)."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

APPLY_RETENTION_SQL = text("SELECT * FROM apply_message_retention(:batch_size)")
PURGE_TTL_SQL = text("SELECT purge_messages_older_than_ttl(:batch_size) AS deleted")


async def run_message_retention(session: AsyncSession, *, batch_size: int = 500) -> dict[str, int]:
    result = await session.execute(APPLY_RETENTION_SQL, {"batch_size": batch_size})
    row = result.mappings().first()
    if not row:
        return {"hard_deleted": 0, "tombstoned": 0}
    return {"hard_deleted": int(row["hard_deleted"]), "tombstoned": int(row["tombstoned"])}


async def run_ttl_purge(session: AsyncSession, *, batch_size: int = 1000) -> int:
    result = await session.execute(PURGE_TTL_SQL, {"batch_size": batch_size})
    row = result.scalar()
    return int(row or 0)
