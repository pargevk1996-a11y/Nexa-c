"""Full-text search query builders (PostgreSQL tsvector)."""

from __future__ import annotations

from typing import Any


def build_fts_query(user_query: str) -> str:
    """Sanitize user input into a tsquery-compatible prefix search string."""
    tokens = [t.strip() for t in user_query.split() if t.strip()]
    if not tokens:
        return ""
    # websearch_to_tsquery-friendly: quote phrases, add :* prefix per token
    parts = []
    for t in tokens[:20]:
        safe = "".join(c for c in t if c.isalnum() or c in ("_", "-"))
        if safe:
            parts.append(f"{safe}:*")
    return " & ".join(parts)


def search_messages_sql(
    *,
    conversation_id: str | None = None,
    user_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[str, dict[str, Any]]:
    """
    Parameterized SQL for message search against message_search_index + messages_active.
    Caller must pass :q as tsquery string (from build_fts_query + websearch_to_tsquery in SQL).
    """
    clauses = [
        "msi.deleted_at IS NULL",
        "m.deleted_at IS NULL",
        "m.deleted_for_everyone_at IS NULL",
    ]
    params: dict[str, Any] = {"limit": limit, "offset": offset}

    if conversation_id:
        clauses.append("msi.conversation_id = :conversation_id")
        params["conversation_id"] = conversation_id

    if user_id:
        clauses.append(
            """
            EXISTS (
              SELECT 1 FROM conversation_members cm
              WHERE cm.conversation_id = msi.conversation_id
                AND cm.user_id = :user_id
                AND cm.left_at IS NULL
            )
            """
        )
        params["user_id"] = user_id

    where = " AND ".join(clauses)
    sql = f"""
        SELECT m.id, m.conversation_id, m.seq, m.sender_id, m.content_type,
               m.created_at, ts_rank(msi.search_vector, q) AS rank
        FROM message_search_index msi
        JOIN messages_active m
          ON m.conversation_id = msi.conversation_id AND m.id = msi.message_id
        CROSS JOIN websearch_to_tsquery('english', :q) q
        WHERE {where}
          AND msi.search_vector @@ q
        ORDER BY rank DESC, m.created_at DESC
        LIMIT :limit OFFSET :offset
    """
    return sql.strip(), params


def search_hashtag_sql(hashtag: str, *, limit: int = 50) -> tuple[str, dict[str, Any]]:
    tag = hashtag.lstrip("#").lower()
    sql = """
        SELECT id, conversation_id, seq, sender_id, content_type, created_at
        FROM messages_active
        WHERE :tag = ANY(hashtags)
        ORDER BY created_at DESC
        LIMIT :limit
    """
    return sql.strip(), {"tag": tag, "limit": limit}
