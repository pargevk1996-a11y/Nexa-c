"""Contact request store — in-memory default, swapped to Postgres in lifespan."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4


@dataclass
class ContactRequest:
    id: str
    from_user_id: str
    to_user_id: str
    status: str  # "pending" | "accepted" | "declined"
    conversation_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    resolved_at: datetime | None = None


@dataclass
class RequestStore:
    _requests: dict[str, ContactRequest] = field(default_factory=dict)
    # (from_id, to_id) → request_id for quick lookup
    _pair_index: dict[tuple[str, str], str] = field(default_factory=dict)

    async def send(self, from_user_id: str, to_user_id: str) -> ContactRequest:
        if from_user_id == to_user_id:
            raise ValueError("SELF_REQUEST")
        key = (from_user_id, to_user_id)
        existing_id = self._pair_index.get(key)
        if existing_id:
            existing = self._requests[existing_id]
            if existing.status == "pending":
                raise ValueError("ALREADY_PENDING")
            if existing.status == "accepted":
                raise ValueError("ALREADY_CONTACTS")
        req = ContactRequest(
            id=str(uuid4()),
            from_user_id=from_user_id,
            to_user_id=to_user_id,
            status="pending",
        )
        self._requests[req.id] = req
        self._pair_index[key] = req.id
        return req

    async def accept(self, request_id: str, accepting_user_id: str) -> ContactRequest:
        req = self._requests.get(request_id)
        if not req:
            raise ValueError("NOT_FOUND")
        if req.to_user_id != accepting_user_id:
            raise ValueError("FORBIDDEN")
        if req.status != "pending":
            raise ValueError("NOT_PENDING")
        req.status = "accepted"
        req.resolved_at = datetime.now(UTC)
        return req

    async def decline(self, request_id: str, declining_user_id: str) -> ContactRequest:
        req = self._requests.get(request_id)
        if not req:
            raise ValueError("NOT_FOUND")
        if req.to_user_id != declining_user_id:
            raise ValueError("FORBIDDEN")
        if req.status != "pending":
            raise ValueError("NOT_PENDING")
        req.status = "declined"
        req.resolved_at = datetime.now(UTC)
        return req

    async def cancel(self, request_id: str, cancelling_user_id: str) -> ContactRequest:
        req = self._requests.get(request_id)
        if not req:
            raise ValueError("NOT_FOUND")
        if req.from_user_id != cancelling_user_id:
            raise ValueError("FORBIDDEN")
        if req.status != "pending":
            raise ValueError("NOT_PENDING")
        req.status = "declined"
        req.resolved_at = datetime.now(UTC)
        return req

    async def update_conversation_id(self, request_id: str, conversation_id: str) -> None:
        req = self._requests.get(request_id)
        if req:
            req.conversation_id = conversation_id

    async def get_by_id(self, request_id: str) -> ContactRequest | None:
        return self._requests.get(request_id)

    async def get_status(self, user_a: str, user_b: str) -> str:
        req_id = self._pair_index.get((user_a, user_b))
        if req_id:
            req = self._requests[req_id]
            if req.status == "accepted":
                return "contacts"
            if req.status == "pending":
                return "pending_sent"
        req_id = self._pair_index.get((user_b, user_a))
        if req_id:
            req = self._requests[req_id]
            if req.status == "accepted":
                return "contacts"
            if req.status == "pending":
                return "pending_received"
        return "none"

    async def get_pending_request(self, user_a: str, user_b: str) -> ContactRequest | None:
        for key in [(user_a, user_b), (user_b, user_a)]:
            req_id = self._pair_index.get(key)
            if req_id:
                req = self._requests[req_id]
                if req.status == "pending":
                    return req
        return None

    async def get_resolved_request(self, user_a: str, user_b: str) -> ContactRequest | None:
        for key in [(user_a, user_b), (user_b, user_a)]:
            req_id = self._pair_index.get(key)
            if req_id:
                return self._requests[req_id]
        return None

    async def list_incoming(self, user_id: str) -> list[ContactRequest]:
        return sorted(
            [r for r in self._requests.values() if r.to_user_id == user_id and r.status == "pending"],
            key=lambda r: r.created_at,
            reverse=True,
        )

    async def list_outgoing(self, user_id: str) -> list[ContactRequest]:
        return sorted(
            [r for r in self._requests.values() if r.from_user_id == user_id and r.status == "pending"],
            key=lambda r: r.created_at,
            reverse=True,
        )

    async def are_contacts(self, user_a: str, user_b: str) -> bool:
        for key in [(user_a, user_b), (user_b, user_a)]:
            req_id = self._pair_index.get(key)
            if req_id and self._requests[req_id].status == "accepted":
                return True
        return False


class _RequestStoreProxy:
    """Starts in-memory; call _switch_to_postgres() in lifespan to use Postgres."""

    def __init__(self) -> None:
        self._impl: RequestStore = RequestStore()

    def _switch_to_postgres(self, pg) -> None:
        self._impl = pg

    def __getattr__(self, name: str):
        return getattr(self._impl, name)


request_store = _RequestStoreProxy()
