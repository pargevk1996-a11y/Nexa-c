"""SQLAlchemy ORM rows for contact_db — aligned with 001_schema.sql."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ContactRequestRow(Base):
    __tablename__ = "contact_requests"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    from_user_id: Mapped[str] = mapped_column(Text, nullable=False)
    to_user_id: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    conversation_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BlockedUserRow(Base):
    __tablename__ = "blocked_users"

    owner_id: Mapped[str] = mapped_column(Text, primary_key=True)
    blocked_user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    reason: Mapped[str | None] = mapped_column(Text)
    blocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
