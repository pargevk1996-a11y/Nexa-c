"""In-memory call rooms (signaling state)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4


@dataclass
class CallRoom:
    id: str
    caller_id: str
    call_type: str
    participant_ids: list[str]
    conversation_id: str | None
    is_group: bool
    status: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    ended_at: datetime | None = None


@dataclass
class CallStore:
    _rooms: dict[str, CallRoom] = field(default_factory=dict)

    def create(
        self,
        caller_id: str,
        *,
        call_type: str,
        participant_ids: list[str],
        conversation_id: str | None,
        is_group: bool,
    ) -> CallRoom:
        all_participants = list({caller_id, *participant_ids})
        room = CallRoom(
            id=str(uuid4()),
            caller_id=caller_id,
            call_type=call_type,
            participant_ids=all_participants,
            conversation_id=conversation_id,
            is_group=is_group or len(all_participants) > 2,
            status="ringing",
        )
        self._rooms[room.id] = room
        return room

    def get(self, call_id: str) -> CallRoom | None:
        return self._rooms.get(call_id)

    def participant(self, call_id: str, user_id: str) -> CallRoom | None:
        room = self._rooms.get(call_id)
        if not room or user_id not in room.participant_ids:
            return None
        return room

    def update_status(self, call_id: str, status: str) -> CallRoom | None:
        room = self._rooms.get(call_id)
        if not room:
            return None
        room.status = status
        if status in ("ended", "rejected", "missed"):
            room.ended_at = datetime.now(UTC)
        return room

    def list_for_user(self, user_id: str, limit: int = 20) -> list[CallRoom]:
        rooms = [r for r in self._rooms.values() if user_id in r.participant_ids]
        rooms.sort(key=lambda r: r.created_at, reverse=True)
        return rooms[:limit]


call_store = CallStore()
