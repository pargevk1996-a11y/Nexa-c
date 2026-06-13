"""Postgres-backed implementations of RequestStore and BlockStore."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.contact import BlockedUserRow, ContactRequestRow
from app.services.block_store import BlockRecord
from app.services.request_store import ContactRequest


class PostgresRequestStore:
    def __init__(self, sm: async_sessionmaker[AsyncSession]) -> None:
        self._sm = sm

    def _row_to_req(self, row: ContactRequestRow) -> ContactRequest:
        return ContactRequest(
            id=row.id,
            from_user_id=row.from_user_id,
            to_user_id=row.to_user_id,
            status=row.status,
            conversation_id=row.conversation_id,
            created_at=row.created_at,
            resolved_at=row.resolved_at,
        )

    async def send(self, from_user_id: str, to_user_id: str) -> ContactRequest:
        if from_user_id == to_user_id:
            raise ValueError("SELF_REQUEST")
        async with self._sm() as s:
            # Check existing in both directions
            existing = (await s.execute(
                select(ContactRequestRow).where(
                    ContactRequestRow.from_user_id == from_user_id,
                    ContactRequestRow.to_user_id == to_user_id,
                )
            )).scalars().first()
            if existing:
                if existing.status == "pending":
                    raise ValueError("ALREADY_PENDING")
                if existing.status == "accepted":
                    raise ValueError("ALREADY_CONTACTS")
            # Check reverse direction for "already contacts"
            reverse = (await s.execute(
                select(ContactRequestRow).where(
                    ContactRequestRow.from_user_id == to_user_id,
                    ContactRequestRow.to_user_id == from_user_id,
                    ContactRequestRow.status == "accepted",
                )
            )).scalars().first()
            if reverse:
                raise ValueError("ALREADY_CONTACTS")

            row = ContactRequestRow(
                id=str(uuid4()),
                from_user_id=from_user_id,
                to_user_id=to_user_id,
                status="pending",
            )
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return self._row_to_req(row)

    async def _update_status(
        self, request_id: str, actor_id: str, *, actor_field: str, new_status: str
    ) -> ContactRequest:
        async with self._sm() as s:
            row = await s.get(ContactRequestRow, request_id)
            if not row:
                raise ValueError("NOT_FOUND")
            if getattr(row, actor_field) != actor_id:
                raise ValueError("FORBIDDEN")
            if row.status != "pending":
                raise ValueError("NOT_PENDING")
            row.status = new_status
            row.resolved_at = datetime.now(UTC)
            await s.commit()
            await s.refresh(row)
            return self._row_to_req(row)

    async def accept(self, request_id: str, accepting_user_id: str) -> ContactRequest:
        return await self._update_status(
            request_id, accepting_user_id, actor_field="to_user_id", new_status="accepted"
        )

    async def decline(self, request_id: str, declining_user_id: str) -> ContactRequest:
        return await self._update_status(
            request_id, declining_user_id, actor_field="to_user_id", new_status="declined"
        )

    async def cancel(self, request_id: str, cancelling_user_id: str) -> ContactRequest:
        return await self._update_status(
            request_id, cancelling_user_id, actor_field="from_user_id", new_status="declined"
        )

    async def update_conversation_id(self, request_id: str, conversation_id: str) -> None:
        async with self._sm() as s:
            await s.execute(
                update(ContactRequestRow)
                .where(ContactRequestRow.id == request_id)
                .values(conversation_id=conversation_id)
            )
            await s.commit()

    async def get_by_id(self, request_id: str) -> ContactRequest | None:
        async with self._sm() as s:
            row = await s.get(ContactRequestRow, request_id)
            return self._row_to_req(row) if row else None

    async def get_status(self, user_a: str, user_b: str) -> str:
        async with self._sm() as s:
            row = (await s.execute(
                select(ContactRequestRow).where(
                    ContactRequestRow.from_user_id == user_a,
                    ContactRequestRow.to_user_id == user_b,
                )
            )).scalars().first()
            if row:
                if row.status == "accepted":
                    return "contacts"
                if row.status == "pending":
                    return "pending_sent"
            row = (await s.execute(
                select(ContactRequestRow).where(
                    ContactRequestRow.from_user_id == user_b,
                    ContactRequestRow.to_user_id == user_a,
                )
            )).scalars().first()
            if row:
                if row.status == "accepted":
                    return "contacts"
                if row.status == "pending":
                    return "pending_received"
        return "none"

    async def get_pending_request(self, user_a: str, user_b: str) -> ContactRequest | None:
        async with self._sm() as s:
            for from_id, to_id in [(user_a, user_b), (user_b, user_a)]:
                row = (await s.execute(
                    select(ContactRequestRow).where(
                        ContactRequestRow.from_user_id == from_id,
                        ContactRequestRow.to_user_id == to_id,
                        ContactRequestRow.status == "pending",
                    )
                )).scalars().first()
                if row:
                    return self._row_to_req(row)
        return None

    async def get_resolved_request(self, user_a: str, user_b: str) -> ContactRequest | None:
        async with self._sm() as s:
            for from_id, to_id in [(user_a, user_b), (user_b, user_a)]:
                row = (await s.execute(
                    select(ContactRequestRow).where(
                        ContactRequestRow.from_user_id == from_id,
                        ContactRequestRow.to_user_id == to_id,
                    ).order_by(ContactRequestRow.created_at.desc())
                )).scalars().first()
                if row:
                    return self._row_to_req(row)
        return None

    async def list_incoming(self, user_id: str) -> list[ContactRequest]:
        async with self._sm() as s:
            rows = (await s.execute(
                select(ContactRequestRow).where(
                    ContactRequestRow.to_user_id == user_id,
                    ContactRequestRow.status == "pending",
                ).order_by(ContactRequestRow.created_at.desc())
            )).scalars().all()
            return [self._row_to_req(r) for r in rows]

    async def list_outgoing(self, user_id: str) -> list[ContactRequest]:
        async with self._sm() as s:
            rows = (await s.execute(
                select(ContactRequestRow).where(
                    ContactRequestRow.from_user_id == user_id,
                    ContactRequestRow.status == "pending",
                ).order_by(ContactRequestRow.created_at.desc())
            )).scalars().all()
            return [self._row_to_req(r) for r in rows]

    async def are_contacts(self, user_a: str, user_b: str) -> bool:
        return await self.get_status(user_a, user_b) == "contacts"


class PostgresBlockStore:
    def __init__(self, sm: async_sessionmaker[AsyncSession]) -> None:
        self._sm = sm

    def _row_to_block(self, row: BlockedUserRow) -> BlockRecord:
        return BlockRecord(
            owner_id=row.owner_id,
            blocked_user_id=row.blocked_user_id,
            reason=row.reason,
            blocked_at=row.blocked_at,
        )

    async def block(self, owner_id: str, blocked_user_id: str, *, reason: str | None = None) -> BlockRecord:
        if owner_id == blocked_user_id:
            raise ValueError("SELF_BLOCK")
        async with self._sm() as s:
            existing = await s.get(BlockedUserRow, (owner_id, blocked_user_id))
            if existing:
                existing.reason = reason
                await s.commit()
                await s.refresh(existing)
                return self._row_to_block(existing)
            row = BlockedUserRow(owner_id=owner_id, blocked_user_id=blocked_user_id, reason=reason)
            s.add(row)
            await s.commit()
            await s.refresh(row)
            return self._row_to_block(row)

    async def unblock(self, owner_id: str, blocked_user_id: str) -> bool:
        async with self._sm() as s:
            result = await s.execute(
                delete(BlockedUserRow).where(
                    BlockedUserRow.owner_id == owner_id,
                    BlockedUserRow.blocked_user_id == blocked_user_id,
                )
            )
            await s.commit()
            return result.rowcount > 0

    async def list_blocks(self, owner_id: str) -> list[BlockRecord]:
        async with self._sm() as s:
            rows = (await s.execute(
                select(BlockedUserRow)
                .where(BlockedUserRow.owner_id == owner_id)
                .order_by(BlockedUserRow.blocked_at.desc())
            )).scalars().all()
            return [self._row_to_block(r) for r in rows]

    async def is_blocked(self, owner_id: str, other_id: str) -> bool:
        async with self._sm() as s:
            row = await s.get(BlockedUserRow, (owner_id, other_id))
            return row is not None
