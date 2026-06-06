"""Postgres-backed implementation of ChatStore."""

from __future__ import annotations

import dataclasses
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import (
    BanRow,
    ConversationRow,
    MemberRow,
    MessageReactionRow,
    MessageRow,
    MessageUserStateRow,
    PinnedMessageRow,
    ReadReceiptRow,
)
from app.domain.permissions import ROLE_MEMBER, ROLE_OWNER
from app.domain.space_types import BROADCAST_TYPES, normalize_type
from app.services.chat_store import (
    Conversation,
    Member,
    Message,
    SpaceSettings,
)
from app.services.message_crypto import maybe_decrypt_body, maybe_encrypt_body


def _uuid(s: str) -> UUID:
    return UUID(s)


def _str(u: UUID | None) -> str | None:
    return str(u) if u is not None else None


def _settings_to_dict(s: SpaceSettings) -> dict:
    return dataclasses.asdict(s)


def _dict_to_settings(d: dict) -> SpaceSettings:
    return SpaceSettings(
        slow_mode_seconds=d.get("slow_mode_seconds", 0),
        anti_spam_enabled=d.get("anti_spam_enabled", True),
        auto_mod_level=d.get("auto_mod_level", 1),
        join_requires_verification=d.get("join_requires_verification", False),
        comments_enabled=d.get("comments_enabled", True),
        invite_only=d.get("invite_only", False),
    )


def _to_member(row: MemberRow) -> Member:
    return Member(
        user_id=str(row.user_id),
        role=row.role,
        is_verified=False,
        joined_at=row.joined_at,
    )


def _to_conversation(
    row: ConversationRow,
    members: list[MemberRow],
    bans: list[BanRow],
    pinned: list[PinnedMessageRow],
) -> Conversation:
    muted_until: dict[str, datetime] = {}
    for m in members:
        if m.muted_until and m.muted_until > datetime.now(UTC):
            muted_until[str(m.user_id)] = m.muted_until

    return Conversation(
        id=str(row.id),
        type=row.type,
        title=row.title,
        description=row.description,
        slug=row.slug,
        is_public=row.is_public,
        verified=row.verified,
        parent_id=_str(row.parent_id),
        members=[_to_member(m) for m in members],
        settings=_dict_to_settings(row.settings or {}),
        pinned_message_ids=[str(p.message_id) for p in pinned if p.unpinned_at is None],
        banned_user_ids={str(b.user_id) for b in bans},
        muted_until=muted_until,
        created_at=row.created_at,
    )


def _to_message(
    row: MessageRow,
    reactions: dict[str, list[str]] | None = None,
    hidden_for: set[str] | None = None,
) -> Message:
    body = row.body_enc.decode("utf-8") if row.body_enc else ""
    return Message(
        id=str(row.id),
        conversation_id=str(row.conversation_id),
        sender_id=str(row.sender_id),
        client_msg_id=row.client_msg_id or "",
        seq=row.seq,
        body=body,
        content_type=row.content_type,
        reply_to_id=_str(row.reply_to_id),
        thread_root_id=_str(row.thread_root_id),
        forward_from_id=_str(row.forward_from_id),
        forward_blocked=False,
        media_id=_str(row.media_id),
        e2ee_envelope=row.e2ee_envelope,
        expires_at=row.expires_at,
        edited_at=row.edited_at,
        deleted_for_everyone_at=row.deleted_for_everyone_at,
        silent=row.silent,
        reactions=reactions or {},
        created_at=row.created_at,
        hidden_for=hidden_for or set(),
        delivered_to=set(),
        read_by=set(),
    )


class PostgresChatStore:
    def __init__(self, sm: async_sessionmaker[AsyncSession]) -> None:
        self._sm = sm

    # ── internal helpers ────────────────────────────────────────────────

    async def _load_conversation(self, session: AsyncSession, conv_id: str) -> Conversation | None:
        try:
            conv_uuid = _uuid(conv_id)
        except ValueError:
            return None
        row = await session.scalar(
            select(ConversationRow).where(
                ConversationRow.id == conv_uuid,
                ConversationRow.deleted_at.is_(None),
            )
        )
        if row is None:
            return None
        members = list(
            await session.scalars(
                select(MemberRow).where(
                    MemberRow.conversation_id == conv_uuid,
                    MemberRow.left_at.is_(None),
                )
            )
        )
        bans = list(await session.scalars(select(BanRow).where(BanRow.conversation_id == conv_uuid)))
        pinned = list(
            await session.scalars(
                select(PinnedMessageRow).where(PinnedMessageRow.conversation_id == conv_uuid)
            )
        )
        return _to_conversation(row, members, bans, pinned)

    async def _load_reactions(
        self, session: AsyncSession, conv_uuid: UUID
    ) -> dict[str, dict[str, list[str]]]:
        rows = list(
            await session.scalars(
                select(MessageReactionRow).where(
                    MessageReactionRow.conversation_id == conv_uuid,
                    MessageReactionRow.deleted_at.is_(None),
                )
            )
        )
        result: dict[str, dict[str, list[str]]] = {}
        for r in rows:
            mid = str(r.message_id)
            result.setdefault(mid, {}).setdefault(r.emoji, []).append(str(r.user_id))
        return result

    async def _load_hidden_for(
        self, session: AsyncSession, conv_uuid: UUID
    ) -> dict[str, set[str]]:
        rows = list(
            await session.scalars(
                select(MessageUserStateRow).where(
                    MessageUserStateRow.conversation_id == conv_uuid
                )
            )
        )
        result: dict[str, set[str]] = {}
        for r in rows:
            result.setdefault(str(r.message_id), set()).add(str(r.user_id))
        return result

    # ── public interface ─────────────────────────────────────────────────

    async def create_conversation(
        self,
        creator_id: str,
        *,
        type: str,
        title: str | None,
        member_ids: list[str],
        is_public: bool,
        description: str | None = None,
        slug: str | None = None,
        parent_id: str | None = None,
        verified: bool = False,
        settings: SpaceSettings | None = None,
    ) -> Conversation:
        space_type = normalize_type(type, is_public=is_public)
        if not settings:
            settings = SpaceSettings()
            if space_type == "private_group":
                settings.invite_only = True

        conv_uuid = uuid4()
        async with self._sm() as session:
            if slug:
                existing = await session.scalar(
                    select(ConversationRow).where(func.lower(ConversationRow.slug) == slug.lower())
                )
                if existing:
                    raise ValueError("SLUG_TAKEN")
            if parent_id:
                parent = await session.scalar(
                    select(ConversationRow).where(
                        ConversationRow.id == _uuid(parent_id),
                        ConversationRow.deleted_at.is_(None),
                    )
                )
                if not parent or parent.type != "community":
                    raise ValueError("INVALID_PARENT")

            conv_row = ConversationRow(
                id=conv_uuid,
                type=space_type,
                title=title,
                description=description,
                slug=slug,
                is_public=is_public or space_type in ("public_group", "supergroup", "channel", "broadcast"),
                verified=verified,
                parent_id=_uuid(parent_id) if parent_id else None,
                settings=_settings_to_dict(settings),
            )
            session.add(conv_row)
            await session.flush()

            all_member_ids = [creator_id] + [m for m in member_ids if m != creator_id]
            for idx, uid in enumerate(all_member_ids):
                role = ROLE_OWNER if idx == 0 else ROLE_MEMBER
                session.add(MemberRow(conversation_id=conv_uuid, user_id=_uuid(uid), role=role))

            await session.commit()

        async with self._sm() as session:
            return await self._load_conversation(session, str(conv_uuid))  # type: ignore[return-value]

    async def list_for_user(self, user_id: str) -> list[Conversation]:
        user_uuid = _uuid(user_id)
        async with self._sm() as session:
            rows = list(
                await session.scalars(
                    select(ConversationRow)
                    .join(MemberRow, MemberRow.conversation_id == ConversationRow.id)
                    .where(
                        MemberRow.user_id == user_uuid,
                        MemberRow.left_at.is_(None),
                        ConversationRow.deleted_at.is_(None),
                    )
                )
            )
            result = []
            for row in rows:
                conv = await self._load_conversation(session, str(row.id))
                if conv:
                    result.append(conv)
            return result

    async def list_public(self, *, space_type: str | None = None, limit: int = 50) -> list[Conversation]:
        async with self._sm() as session:
            q = select(ConversationRow).where(
                ConversationRow.is_public.is_(True),
                ConversationRow.type != "dm",
                ConversationRow.deleted_at.is_(None),
            )
            if space_type:
                q = q.where(ConversationRow.type == space_type)
            q = q.order_by(ConversationRow.created_at.desc()).limit(limit)
            rows = list(await session.scalars(q))
            result = []
            for row in rows:
                conv = await self._load_conversation(session, str(row.id))
                if conv:
                    result.append(conv)
            return result

    async def get_by_slug(self, slug: str) -> Conversation | None:
        async with self._sm() as session:
            row = await session.scalar(
                select(ConversationRow).where(
                    func.lower(ConversationRow.slug) == slug.lower(),
                    ConversationRow.deleted_at.is_(None),
                )
            )
            if not row:
                return None
            return await self._load_conversation(session, str(row.id))

    async def get_conversation(self, conv_id: str, user_id: str) -> Conversation | None:
        async with self._sm() as session:
            conv = await self._load_conversation(session, conv_id)
            if not conv:
                return None
            if conv.is_public and conv.type != "dm":
                return conv
            if any(m.user_id == user_id for m in conv.members):
                return conv
            return None

    async def get_conversation_member(self, conv_id: str, user_id: str) -> Conversation | None:
        async with self._sm() as session:
            conv = await self._load_conversation(session, conv_id)
            if not conv:
                return None
            if any(m.user_id == user_id for m in conv.members):
                return conv
            return None

    async def join_public(self, conv_id: str, user_id: str) -> Conversation:
        async with self._sm() as session:
            conv = await self._load_conversation(session, conv_id)
            if not conv or not conv.is_public:
                raise ValueError("NOT_FOUND")
            if user_id in conv.banned_user_ids:
                raise ValueError("BANNED")
            if conv.settings.join_requires_verification:
                raise ValueError("VERIFICATION_REQUIRED")
            if conv.settings.invite_only:
                raise ValueError("INVITE_ONLY")
            if not any(m.user_id == user_id for m in conv.members):
                conv_uuid = _uuid(conv_id)
                stmt = pg_insert(MemberRow).values(
                    conversation_id=conv_uuid,
                    user_id=_uuid(user_id),
                    role=ROLE_MEMBER,
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["conversation_id", "user_id"],
                    set_={"left_at": None, "role": ROLE_MEMBER},
                )
                await session.execute(stmt)
                await session.commit()
            return await self._load_conversation(session, conv_id)  # type: ignore[return-value]

    async def leave(self, conv_id: str, user_id: str) -> None:
        async with self._sm() as session:
            conv = await self._load_conversation(session, conv_id)
            if not conv:
                raise ValueError("NOT_FOUND")
            member = next((m for m in conv.members if m.user_id == user_id), None)
            if not member:
                return
            from app.domain.permissions import rank, ROLE_OWNER
            if member.role == ROLE_OWNER:
                owners = [m for m in conv.members if m.role == ROLE_OWNER]
                if len(owners) <= 1:
                    others = [m for m in conv.members if m.user_id != user_id]
                    if others:
                        new_owner = others[0]
                        await session.execute(
                            update(MemberRow)
                            .where(
                                MemberRow.conversation_id == _uuid(conv_id),
                                MemberRow.user_id == _uuid(new_owner.user_id),
                            )
                            .values(role=ROLE_OWNER)
                        )
            await session.execute(
                update(MemberRow)
                .where(
                    MemberRow.conversation_id == _uuid(conv_id),
                    MemberRow.user_id == _uuid(user_id),
                )
                .values(left_at=datetime.now(UTC))
            )
            await session.commit()

    async def add_members(self, conv_id: str, user_ids: list[str]) -> None:
        conv_uuid = _uuid(conv_id)
        async with self._sm() as session:
            for uid in user_ids:
                stmt = pg_insert(MemberRow).values(
                    conversation_id=conv_uuid,
                    user_id=_uuid(uid),
                    role=ROLE_MEMBER,
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["conversation_id", "user_id"],
                    set_={"left_at": None},
                )
                await session.execute(stmt)
            await session.commit()

    async def set_member_role(self, conv_id: str, actor_id: str, target_id: str, role: str) -> Member:
        async with self._sm() as session:
            conv = await self._load_conversation(session, conv_id)
            if not conv:
                raise ValueError("NOT_FOUND")
            actor = next((m for m in conv.members if m.user_id == actor_id), None)
            target = next((m for m in conv.members if m.user_id == target_id), None)
            if not actor or not target:
                raise ValueError("NOT_FOUND")
            from app.domain.permissions import rank
            if rank(actor.role) <= rank(target.role) and actor_id != target_id:
                raise ValueError("FORBIDDEN")
            if rank(role) >= rank(actor.role) and actor_id != target_id:
                raise ValueError("FORBIDDEN")
            await session.execute(
                update(MemberRow)
                .where(
                    MemberRow.conversation_id == _uuid(conv_id),
                    MemberRow.user_id == _uuid(target_id),
                )
                .values(role=role)
            )
            await session.commit()
            target.role = role
            return target

    async def update_settings(self, conv_id: str, settings: SpaceSettings) -> Conversation:
        async with self._sm() as session:
            await session.execute(
                update(ConversationRow)
                .where(ConversationRow.id == _uuid(conv_id))
                .values(settings=_settings_to_dict(settings))
            )
            await session.commit()
            return await self._load_conversation(session, conv_id)  # type: ignore[return-value]

    async def ban_user(self, conv_id: str, target_id: str) -> None:
        conv_uuid = _uuid(conv_id)
        async with self._sm() as session:
            stmt = pg_insert(BanRow).values(
                conversation_id=conv_uuid, user_id=_uuid(target_id)
            ).on_conflict_do_nothing()
            await session.execute(stmt)
            await session.execute(
                update(MemberRow)
                .where(
                    MemberRow.conversation_id == conv_uuid,
                    MemberRow.user_id == _uuid(target_id),
                )
                .values(left_at=datetime.now(UTC))
            )
            await session.commit()

    async def unban_user(self, conv_id: str, target_id: str) -> None:
        async with self._sm() as session:
            await session.execute(
                delete(BanRow).where(
                    BanRow.conversation_id == _uuid(conv_id),
                    BanRow.user_id == _uuid(target_id),
                )
            )
            await session.commit()

    async def mute_user(self, conv_id: str, target_id: str, *, until: datetime) -> None:
        async with self._sm() as session:
            await session.execute(
                update(MemberRow)
                .where(
                    MemberRow.conversation_id == _uuid(conv_id),
                    MemberRow.user_id == _uuid(target_id),
                )
                .values(muted_until=until)
            )
            await session.commit()

    async def unmute_user(self, conv_id: str, target_id: str) -> None:
        async with self._sm() as session:
            await session.execute(
                update(MemberRow)
                .where(
                    MemberRow.conversation_id == _uuid(conv_id),
                    MemberRow.user_id == _uuid(target_id),
                )
                .values(muted_until=None)
            )
            await session.commit()

    async def list_channels_in_community(self, community_id: str) -> list[Conversation]:
        community_uuid = _uuid(community_id)
        async with self._sm() as session:
            rows = list(
                await session.scalars(
                    select(ConversationRow).where(
                        ConversationRow.parent_id == community_uuid,
                        ConversationRow.type.in_(list(BROADCAST_TYPES)),
                        ConversationRow.deleted_at.is_(None),
                    )
                )
            )
            result = []
            for row in rows:
                conv = await self._load_conversation(session, str(row.id))
                if conv:
                    result.append(conv)
            return result

    async def send_message(
        self,
        conv_id: str,
        sender_id: str,
        *,
        client_msg_id: str,
        body: str,
        content_type: str = "text",
        reply_to_id: str | None = None,
        thread_root_id: str | None = None,
        forward_from_id: str | None = None,
        forward_blocked: bool = False,
        media_id: str | None = None,
        e2ee_envelope: dict | None = None,
        expires_at: datetime | None = None,
        silent: bool = False,
    ) -> Message:
        conv_uuid = _uuid(conv_id)
        async with self._sm() as session:
            # Idempotency check
            if client_msg_id:
                existing = await session.scalar(
                    select(MessageRow).where(
                        MessageRow.conversation_id == conv_uuid,
                        MessageRow.client_msg_id == client_msg_id,
                    )
                )
                if existing:
                    return _to_message(existing)

            conv = await self._load_conversation(session, conv_id)
            if not conv:
                raise ValueError("NOT_FOUND")
            if sender_id in conv.banned_user_ids:
                raise ValueError("BANNED")
            if thread_root_id:
                root = await session.scalar(
                    select(MessageRow).where(
                        MessageRow.conversation_id == conv_uuid,
                        MessageRow.id == _uuid(thread_root_id),
                    )
                )
                if not root:
                    raise ValueError("INVALID_THREAD")

            seq_result = await session.execute(
                text("SELECT next_message_seq(:cid)"), {"cid": conv_uuid}
            )
            seq = seq_result.scalar_one()

            msg_id = uuid4()
            body_stored = maybe_encrypt_body(body).encode("utf-8")
            row = MessageRow(
                id=msg_id,
                conversation_id=conv_uuid,
                seq=seq,
                sender_id=_uuid(sender_id),
                client_msg_id=client_msg_id or None,
                body_enc=body_stored,
                content_type=content_type,
                reply_to_id=_uuid(reply_to_id) if reply_to_id else None,
                thread_root_id=_uuid(thread_root_id) if thread_root_id else None,
                forward_from_id=_uuid(forward_from_id) if forward_from_id else None,
                media_id=_uuid(media_id) if media_id else None,
                e2ee_envelope=e2ee_envelope,
                expires_at=expires_at,
                silent=silent,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return _to_message(row)

    async def list_messages(
        self,
        conv_id: str,
        user_id: str,
        *,
        before_seq: int | None = None,
        after_seq: int | None = None,
        thread_root_id: str | None = None,
        main_timeline_only: bool = False,
        limit: int = 50,
    ) -> list[Message]:
        conv = await self.get_conversation(conv_id, user_id)
        if not conv:
            return []
        conv_uuid = _uuid(conv_id)
        user_uuid = _uuid(user_id)
        async with self._sm() as session:
            q = select(MessageRow).where(
                MessageRow.conversation_id == conv_uuid,
                MessageRow.deleted_for_everyone_at.is_(None),
            )
            # Exclude messages hidden for this user
            hidden_subq = select(MessageUserStateRow.message_id).where(
                MessageUserStateRow.conversation_id == conv_uuid,
                MessageUserStateRow.user_id == user_uuid,
            )
            q = q.where(MessageRow.id.not_in(hidden_subq))

            if thread_root_id:
                thread_uuid = _uuid(thread_root_id)
                q = q.where(
                    (MessageRow.thread_root_id == thread_uuid) | (MessageRow.id == thread_uuid)
                )
            elif main_timeline_only:
                q = q.where(MessageRow.thread_root_id.is_(None))

            if before_seq is not None:
                q = q.where(MessageRow.seq < before_seq)
            if after_seq is not None:
                q = q.where(MessageRow.seq > after_seq).order_by(MessageRow.seq.asc()).limit(limit)
            else:
                q = q.order_by(MessageRow.seq.desc()).limit(limit)

            rows = list(await session.scalars(q))
            if after_seq is None:
                rows = list(reversed(rows))

            reactions = await self._load_reactions(session, conv_uuid)
            return [_to_message(r, reactions.get(str(r.id))) for r in rows]

    async def thread_reply_count(self, root_id: str) -> int:
        async with self._sm() as session:
            try:
                root_uuid = _uuid(root_id)
            except ValueError:
                return 0
            result = await session.scalar(
                select(func.count())
                .select_from(MessageRow)
                .where(
                    MessageRow.thread_root_id == root_uuid,
                    MessageRow.deleted_for_everyone_at.is_(None),
                )
            )
            return result or 0

    async def get_message(self, msg_id: str, user_id: str) -> Message | None:
        async with self._sm() as session:
            try:
                msg_uuid = _uuid(msg_id)
            except ValueError:
                return None
            row = await session.scalar(
                select(MessageRow).where(MessageRow.id == msg_uuid)
            )
            if not row:
                return None
            conv = await self.get_conversation(str(row.conversation_id), user_id)
            if not conv:
                return None
            return _to_message(row)

    async def edit_message(self, msg_id: str, user_id: str, body: str) -> Message | None:
        msg = await self.get_message(msg_id, user_id)
        if not msg or msg.sender_id != user_id:
            return None
        async with self._sm() as session:
            row = await session.scalar(
                select(MessageRow).where(MessageRow.id == _uuid(msg_id))
            )
            if not row:
                return None
            row.body_enc = maybe_encrypt_body(body).encode("utf-8")
            row.edited_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(row)
            return _to_message(row)

    async def delete_message(
        self, msg_id: str, user_id: str, *, for_everyone: bool, moderator: bool = False
    ) -> bool:
        msg = await self.get_message(msg_id, user_id)
        if not msg:
            return False
        async with self._sm() as session:
            row = await session.scalar(
                select(MessageRow).where(MessageRow.id == _uuid(msg_id))
            )
            if not row:
                return False
            if for_everyone:
                if not moderator and msg.sender_id != user_id:
                    return False
                row.deleted_for_everyone_at = datetime.now(UTC)
            else:
                session.add(
                    MessageUserStateRow(
                        conversation_id=row.conversation_id,
                        message_id=row.id,
                        user_id=_uuid(user_id),
                    )
                )
            await session.commit()
            return True

    async def add_reaction(self, msg_id: str, user_id: str, emoji: str) -> Message | None:
        msg = await self.get_message(msg_id, user_id)
        if not msg:
            return None
        async with self._sm() as session:
            row = await session.scalar(
                select(MessageRow).where(MessageRow.id == _uuid(msg_id))
            )
            if not row:
                return None
            stmt = pg_insert(MessageReactionRow).values(
                conversation_id=row.conversation_id,
                message_id=row.id,
                user_id=_uuid(user_id),
                emoji=emoji,
            ).on_conflict_do_update(
                index_elements=["conversation_id", "message_id", "user_id", "emoji"],
                set_={"deleted_at": None},
            )
            await session.execute(stmt)
            await session.commit()
        return await self.get_message(msg_id, user_id)

    async def mark_delivered(self, msg_id: str, user_id: str) -> None:
        pass  # Delivery receipts tracked via separate delivery_receipts table; no-op here.

    async def mark_read(self, conv_id: str, user_id: str, up_to_seq: int) -> None:
        async with self._sm() as session:
            await session.execute(
                text("""
                    INSERT INTO read_receipts (conversation_id, user_id, up_to_seq, read_at)
                    VALUES (:conv_id, :user_id, :seq, now())
                    ON CONFLICT (conversation_id, user_id) DO UPDATE
                    SET up_to_seq = GREATEST(read_receipts.up_to_seq, EXCLUDED.up_to_seq),
                        read_at = now()
                """),
                {"conv_id": _uuid(conv_id), "user_id": _uuid(user_id), "seq": up_to_seq},
            )
            await session.commit()

    async def pin_message(
        self, conv_id: str, user_id: str, message_id: str, pinned: bool
    ) -> Conversation | None:
        conv = await self.get_conversation_member(conv_id, user_id)
        if not conv:
            return None
        conv_uuid = _uuid(conv_id)
        async with self._sm() as session:
            if pinned:
                try:
                    msg_uuid = _uuid(message_id)
                except ValueError:
                    return conv
                stmt = pg_insert(PinnedMessageRow).values(
                    conversation_id=conv_uuid,
                    message_id=msg_uuid,
                    pinned_by=_uuid(user_id),
                ).on_conflict_do_update(
                    index_elements=["conversation_id", "message_id"],
                    set_={"unpinned_at": None, "pinned_by": _uuid(user_id)},
                )
                await session.execute(stmt)
            else:
                try:
                    msg_uuid = _uuid(message_id)
                except ValueError:
                    return conv
                await session.execute(
                    update(PinnedMessageRow)
                    .where(
                        PinnedMessageRow.conversation_id == conv_uuid,
                        PinnedMessageRow.message_id == msg_uuid,
                    )
                    .values(unpinned_at=datetime.now(UTC))
                )
            await session.commit()
            return await self._load_conversation(session, conv_id)

    async def get_latest_seq(self, conv_id: str) -> int:
        async with self._sm() as session:
            result = await session.scalar(
                select(func.max(MessageRow.seq)).where(
                    MessageRow.conversation_id == _uuid(conv_id)
                )
            )
            return result or 0

    async def get_last_message_preview(self, conv_id: str) -> str | None:
        async with self._sm() as session:
            row = await session.scalar(
                select(MessageRow)
                .where(
                    MessageRow.conversation_id == _uuid(conv_id),
                    MessageRow.deleted_for_everyone_at.is_(None),
                )
                .order_by(MessageRow.seq.desc())
                .limit(1)
            )
            if not row:
                return None
            body = row.body_enc.decode("utf-8") if row.body_enc else ""
            return maybe_decrypt_body(body)[:80]

    async def get_unread_count(self, conv_id: str, user_id: str) -> int:
        async with self._sm() as session:
            receipt = await session.scalar(
                select(ReadReceiptRow).where(
                    ReadReceiptRow.conversation_id == _uuid(conv_id),
                    ReadReceiptRow.user_id == _uuid(user_id),
                )
            )
            last_read = receipt.up_to_seq if receipt else 0
            result = await session.scalar(
                select(func.count())
                .select_from(MessageRow)
                .where(
                    MessageRow.conversation_id == _uuid(conv_id),
                    MessageRow.sender_id != _uuid(user_id),
                    MessageRow.seq > last_read,
                    MessageRow.deleted_for_everyone_at.is_(None),
                )
            )
            return result or 0

    async def get_member_ids(self, conv_id: str, exclude: str | None = None) -> list[str]:
        conv_uuid = _uuid(conv_id)
        async with self._sm() as session:
            rows = list(
                await session.scalars(
                    select(MemberRow).where(
                        MemberRow.conversation_id == conv_uuid,
                        MemberRow.left_at.is_(None),
                    )
                )
            )
            ids = [str(r.user_id) for r in rows]
            if exclude:
                ids = [uid for uid in ids if uid != exclude]
            return ids
