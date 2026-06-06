"""Structured audit events (in-memory dev store; Postgres in production)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4


@dataclass
class AuditEvent:
    id: str
    event_type: str
    user_id: str | None
    session_id: str | None
    ip_hash: str | None
    metadata: dict[str, Any]
    created_at: datetime


@dataclass
class AuditLog:
    _events: list[AuditEvent] = field(default_factory=list)
    _max: int = 10_000

    def record(
        self,
        event_type: str,
        *,
        user_id: str | None = None,
        session_id: str | None = None,
        ip_hint: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditEvent:
        import hashlib

        ip_hash = hashlib.sha256((ip_hint or "").encode()).hexdigest()[:16] if ip_hint else None
        ev = AuditEvent(
            id=str(uuid4()),
            event_type=event_type,
            user_id=user_id,
            session_id=session_id,
            ip_hash=ip_hash,
            metadata=metadata or {},
            created_at=datetime.now(UTC),
        )
        self._events.append(ev)
        if len(self._events) > self._max:
            self._events = self._events[-self._max :]
        return ev

    def list_for_user(self, user_id: str, limit: int = 50) -> list[AuditEvent]:
        items = [e for e in reversed(self._events) if e.user_id == user_id]
        return items[:limit]


audit_log = AuditLog()
