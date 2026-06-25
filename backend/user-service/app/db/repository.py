"""Postgres-backed implementation of ProfileStore."""

from __future__ import annotations

from datetime import UTC, datetime

from nexa_shared.utils.uid import generate_public_uid
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import ProfileRow
from app.services.profile_store import Profile, ProfilePrivacy, effective_online


class PostgresProfileStore:
    def __init__(self, sm: async_sessionmaker[AsyncSession]) -> None:
        self._sm = sm

    def _to_profile(self, row: ProfileRow) -> Profile:
        return Profile(
            id=row.id,
            username=row.username,
            uid=row.uid,
            nickname=row.nickname,
            bio=row.bio,
            status_text=row.status_text,
            avatar_url=row.avatar_url,
            animated_avatar_url=row.animated_avatar_url,
            avatar_kind=row.avatar_kind,  # type: ignore[arg-type]
            is_online=row.is_online,
            last_seen_at=row.last_seen_at,
            verification_badge=row.verification_badge,  # type: ignore[arg-type]
            privacy=ProfilePrivacy(
                show_last_seen=row.show_last_seen,
                show_online_status=row.show_online_status,
                show_bio=row.show_bio,
                show_status_text=row.show_status_text,
                show_avatar=row.show_avatar,
                allow_search_by_username=row.allow_search_by_username,
            ),
            ecdh_public_key=getattr(row, "ecdh_public_key", None),
            mlkem_public_key=getattr(row, "mlkem_public_key", None),
        )

    async def bootstrap(self, user_id: str, username: str, *, nickname: str | None = None) -> Profile:
        clean = username.strip().lstrip("$")[:64] or f"user_{user_id[:8]}"
        async with self._sm() as session:
            row = await session.scalar(select(ProfileRow).where(ProfileRow.id == user_id))
            if row:
                dirty = False
                if clean and row.username != clean:
                    taken = await session.scalar(
                        select(ProfileRow).where(
                            func.lower(ProfileRow.username) == clean.lower(),
                            ProfileRow.id != user_id,
                        )
                    )
                    if not taken:
                        row.username = clean
                        dirty = True
                if nickname is not None and nickname.strip():
                    row.nickname = nickname.strip()[:64]
                    dirty = True
                if dirty:
                    await session.commit()
                    await session.refresh(row)
                return self._to_profile(row)
        return await self.ensure_profile(user_id, clean)

    async def clear_avatar(self, user_id: str) -> Profile | None:
        async with self._sm() as session:
            row = await session.scalar(select(ProfileRow).where(ProfileRow.id == user_id))
            if not row:
                return None
            row.avatar_url = None
            row.animated_avatar_url = None
            row.avatar_kind = "initial"
            await session.commit()
            await session.refresh(row)
            return self._to_profile(row)

    async def ensure_profile(self, user_id: str, username: str) -> Profile:
        existing = await self.get(user_id)
        if existing:
            return existing
        taken = await self.get_by_username(username)
        if taken and taken.id != user_id:
            username = f"{username}_{user_id[:6]}"
        verification_badge = "verified" if username.lower() in ("alex", "maria") else "none"
        async with self._sm() as session:
            row = ProfileRow(
                id=user_id,
                username=username,
                uid=generate_public_uid(),
                verification_badge=verification_badge,
            )
            session.add(row)
            try:
                await session.commit()
                await session.refresh(row)
            except IntegrityError:
                await session.rollback()
                fetched = await session.scalar(select(ProfileRow).where(ProfileRow.id == user_id))
                row = fetched  # type: ignore[assignment]
            return self._to_profile(row)

    async def get(self, user_id: str) -> Profile | None:
        async with self._sm() as session:
            row = await session.scalar(select(ProfileRow).where(ProfileRow.id == user_id))
            return self._to_profile(row) if row else None

    async def get_by_username(self, username: str) -> Profile | None:
        q = username.lower().strip().lstrip("$")
        async with self._sm() as session:
            row = await session.scalar(
                select(ProfileRow).where(func.lower(ProfileRow.username) == q)
            )
            return self._to_profile(row) if row else None

    async def search(self, query: str, limit: int = 20) -> list[Profile]:
        q = query.lower().strip().lstrip("$")
        if not q:
            return []
        pattern = f"%{q}%"
        async with self._sm() as session:
            rows = await session.scalars(
                select(ProfileRow)
                .where(
                    ProfileRow.allow_search_by_username.is_(True),
                    ProfileRow.username.ilike(pattern)
                    | ProfileRow.nickname.ilike(pattern)
                    | ProfileRow.uid.ilike(pattern),
                )
                .limit(limit)
            )
            return [self._to_profile(r) for r in rows]

    async def update(self, user_id: str, **fields) -> Profile | None:
        async with self._sm() as session:
            row = await session.scalar(select(ProfileRow).where(ProfileRow.id == user_id))
            if not row:
                return None
            if "username" in fields and fields["username"] is not None:
                new_name = fields["username"].strip()
                taken = await session.scalar(
                    select(ProfileRow).where(
                        func.lower(ProfileRow.username) == new_name.lower(),
                        ProfileRow.id != user_id,
                    )
                )
                if taken:
                    raise ValueError("USERNAME_TAKEN")
                row.username = new_name
            if "nickname" in fields and fields["nickname"] is not None:
                row.nickname = fields["nickname"].strip()[:64]
            if "bio" in fields and fields["bio"] is not None:
                row.bio = fields["bio"]
            if "status_text" in fields and fields["status_text"] is not None:
                row.status_text = fields["status_text"]
            if "avatar_url" in fields:
                row.avatar_url = fields["avatar_url"]
            if "animated_avatar_url" in fields:
                row.animated_avatar_url = fields["animated_avatar_url"]
            if "avatar_kind" in fields and fields["avatar_kind"] is not None:
                row.avatar_kind = fields["avatar_kind"]
            if "privacy" in fields and fields["privacy"] is not None:
                priv = fields["privacy"]
                if isinstance(priv, ProfilePrivacy):
                    row.show_last_seen = priv.show_last_seen
                    row.show_online_status = priv.show_online_status
                    row.show_bio = priv.show_bio
                    row.show_status_text = priv.show_status_text
                    row.show_avatar = priv.show_avatar
                    row.allow_search_by_username = priv.allow_search_by_username
                elif isinstance(priv, dict):
                    for attr in (
                        "show_last_seen", "show_online_status", "show_bio",
                        "show_status_text", "show_avatar", "allow_search_by_username",
                    ):
                        if attr in priv:
                            setattr(row, attr, priv[attr])
            await session.commit()
            await session.refresh(row)
            return self._to_profile(row)

    async def update_public_key(self, user_id: str, ecdh_public_key: str) -> Profile | None:
        async with self._sm() as session:
            row = await session.scalar(select(ProfileRow).where(ProfileRow.id == user_id))
            if not row:
                return None
            row.ecdh_public_key = ecdh_public_key
            await session.commit()
            await session.refresh(row)
            return self._to_profile(row)

    async def update_mlkem_public_key(self, user_id: str, mlkem_public_key: str) -> Profile | None:
        async with self._sm() as session:
            row = await session.scalar(select(ProfileRow).where(ProfileRow.id == user_id))
            if not row:
                return None
            row.mlkem_public_key = mlkem_public_key
            await session.commit()
            await session.refresh(row)
            return self._to_profile(row)

    async def set_presence(self, user_id: str, *, is_online: bool, status_text: str | None = None) -> Profile | None:
        async with self._sm() as session:
            row = await session.scalar(select(ProfileRow).where(ProfileRow.id == user_id))
            if not row:
                return None
            row.is_online = is_online
            if status_text is not None:
                row.status_text = status_text
            # Always stamp last activity (heartbeat + offline ping) so reads can
            # expire a sticky online flag left by a killed tab / crash / net drop.
            row.last_seen_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(row)
            return self._to_profile(row)

    def apply_privacy_for_viewer(self, profile: Profile, viewer_id: str) -> Profile:
        if profile.id == viewer_id:
            return profile
        p = profile
        return Profile(
            id=p.id,
            username=p.username,
            uid=p.uid,
            nickname=p.nickname,
            bio=p.bio if p.privacy.show_bio else "",
            status_text=p.status_text if p.privacy.show_status_text else "",
            avatar_url=p.avatar_url if p.privacy.show_avatar else None,
            animated_avatar_url=p.animated_avatar_url if p.privacy.show_avatar else None,
            avatar_kind=p.avatar_kind if p.privacy.show_avatar else "initial",
            is_online=effective_online(p.is_online, p.last_seen_at) if p.privacy.show_online_status else False,
            last_seen_at=p.last_seen_at if p.privacy.show_last_seen else None,
            verification_badge=p.verification_badge,
            privacy=p.privacy,
        )
