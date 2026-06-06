"""Sharding and partitioning helpers for chat_db messages."""

from __future__ import annotations

import uuid
import zlib

MESSAGE_PARTITION_COUNT = 32


def partition_remainder(conversation_id: str | uuid.UUID) -> int:
    """Hash shard for conversation_id → partition 0..31 (app routing hint)."""
    s = str(conversation_id)
    try:
        return uuid.UUID(s).int % MESSAGE_PARTITION_COUNT
    except ValueError:
        return zlib.crc32(s.encode("utf-8")) % MESSAGE_PARTITION_COUNT


def partition_name(conversation_id: str | uuid.UUID) -> str:
    return f"messages_p{partition_remainder(conversation_id)}"


def citus_shard_hint(conversation_id: str) -> dict[str, str]:
    """Metadata for Citus / application-level routing (future horizontal scale)."""
    r = partition_remainder(conversation_id)
    return {
        "shard_key": "conversation_id",
        "shard_key_value": str(conversation_id),
        "partition": partition_name(conversation_id),
        "remainder": str(r),
    }
