"""SQLAlchemy ORM rows for user_db — aligned with user_db/001_schema.sql."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ProfileRow(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    username: Mapped[str] = mapped_column(Text, nullable=False)
    uid: Mapped[str] = mapped_column(Text, nullable=False)
    nickname: Mapped[str] = mapped_column(Text, default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    status_text: Mapped[str] = mapped_column(Text, default="")
    avatar_url: Mapped[str | None] = mapped_column(Text)
    animated_avatar_url: Mapped[str | None] = mapped_column(Text)
    avatar_kind: Mapped[str] = mapped_column(Text, default="initial")
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_badge: Mapped[str] = mapped_column(Text, default="none")
    show_last_seen: Mapped[bool] = mapped_column(Boolean, default=True)
    show_online_status: Mapped[bool] = mapped_column(Boolean, default=True)
    show_bio: Mapped[bool] = mapped_column(Boolean, default=True)
    show_status_text: Mapped[bool] = mapped_column(Boolean, default=True)
    show_avatar: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_search_by_username: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
