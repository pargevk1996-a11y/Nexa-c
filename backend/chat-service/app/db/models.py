"""SQLAlchemy ORM rows for chat_db — aligned with infrastructure/postgres/migrations/chat_db/."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, BYTEA, JSONB, UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ConversationRow(Base):
    __tablename__ = "conversations"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    slug: Mapped[str | None] = mapped_column(Text)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    parent_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MemberRow(Base):
    __tablename__ = "conversation_members"

    conversation_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    role: Mapped[str] = mapped_column(Text, default="member")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    muted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BanRow(Base):
    __tablename__ = "conversation_bans"

    conversation_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    banned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SequenceRow(Base):
    __tablename__ = "conversation_sequences"

    conversation_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    next_seq: Mapped[int] = mapped_column(BigInteger, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PinnedMessageRow(Base):
    __tablename__ = "pinned_messages"

    conversation_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    message_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    pinned_by: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    pinned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    unpinned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MessageRow(Base):
    """Maps to partitioned messages table — PK is (conversation_id, seq)."""

    __tablename__ = "messages"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    conversation_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    seq: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    sender_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    client_msg_id: Mapped[str | None] = mapped_column(Text)
    body_enc: Mapped[bytes | None] = mapped_column(BYTEA)
    content_type: Mapped[str] = mapped_column(Text, default="text")
    reply_to_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    forward_from_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    thread_root_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    media_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    e2ee_envelope: Mapped[dict | None] = mapped_column(JSONB)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    silent: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_for_everyone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    search_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MessageReactionRow(Base):
    __tablename__ = "message_reactions"

    conversation_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    message_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    emoji: Mapped[str] = mapped_column(Text, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MessageUserStateRow(Base):
    __tablename__ = "message_user_state"

    conversation_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    message_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    hidden_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReadReceiptRow(Base):
    __tablename__ = "read_receipts"

    conversation_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    up_to_seq: Mapped[int] = mapped_column(BigInteger)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RetentionPolicy(Base):
    __tablename__ = "retention_policies"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    message_ttl_days: Mapped[int | None] = mapped_column()
    soft_delete_grace_days: Mapped[int] = mapped_column(default=30)
    hard_delete_after_days: Mapped[int | None] = mapped_column()
    legal_hold: Mapped[bool] = mapped_column(Boolean, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
