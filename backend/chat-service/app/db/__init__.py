"""PostgreSQL schema helpers (migrations in infrastructure/postgres/migrations/chat_db/)."""

from app.db.search import build_fts_query, search_messages_sql
from app.db.sharding import MESSAGE_PARTITION_COUNT, partition_name, partition_remainder

__all__ = [
    "MESSAGE_PARTITION_COUNT",
    "partition_name",
    "partition_remainder",
    "build_fts_query",
    "search_messages_sql",
]
