"""In-process WebSocket connection registry."""

from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import WebSocket


@dataclass
class ClientConnection:
    websocket: WebSocket
    user_id: str
    conn_id: str
    subscribed_conversations: set[str] = field(default_factory=set)


class ConnectionManager:
    def __init__(self) -> None:
        self._by_conn: dict[str, ClientConnection] = {}
        self._by_user: dict[str, set[str]] = {}

    def add(self, conn: ClientConnection) -> None:
        self._by_conn[conn.conn_id] = conn
        self._by_user.setdefault(conn.user_id, set()).add(conn.conn_id)

    def remove(self, conn_id: str) -> ClientConnection | None:
        conn = self._by_conn.pop(conn_id, None)
        if not conn:
            return None
        user_set = self._by_user.get(conn.user_id)
        if user_set:
            user_set.discard(conn_id)
            if not user_set:
                del self._by_user[conn.user_id]
        return conn

    def get(self, conn_id: str) -> ClientConnection | None:
        return self._by_conn.get(conn_id)

    def connections_for_user(self, user_id: str) -> list[ClientConnection]:
        ids = self._by_user.get(user_id, set())
        return [self._by_conn[cid] for cid in ids if cid in self._by_conn]

    def all_connections(self) -> list[ClientConnection]:
        return list(self._by_conn.values())

    @property
    def connection_count(self) -> int:
        return len(self._by_conn)

    def subscribe(self, conn_id: str, conversation_ids: list[str]) -> None:
        conn = self._by_conn.get(conn_id)
        if conn:
            conn.subscribed_conversations.update(conversation_ids)

    def unsubscribe(self, conn_id: str, conversation_ids: list[str]) -> None:
        conn = self._by_conn.get(conn_id)
        if conn:
            conn.subscribed_conversations -= set(conversation_ids)

    def connections_subscribed_to(
        self,
        conversation_id: str,
        *,
        exclude_user_id: str | None = None,
    ) -> list[ClientConnection]:
        out: list[ClientConnection] = []
        for conn in self._by_conn.values():
            if conversation_id not in conn.subscribed_conversations:
                continue
            if exclude_user_id and conn.user_id == exclude_user_id:
                continue
            out.append(conn)
        return out
