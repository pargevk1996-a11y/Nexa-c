"""Postgres-backed implementations of UserStore, SessionStore, and VerificationStore."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import (
    EmailVerificationCodeRow,
    PasswordResetTokenRow,
    PhoneOtpCodeRow,
    QrSessionRow,
    SessionRow,
    UserRow,
)
from app.services.session_store import QrLoginSession, StoredSession
from app.services.user_store import StoredUser
from nexa_shared.security.passwords import hash_password, verify_password
from nexa_shared.security.tokens import hash_refresh_token
from nexa_shared.utils.uid import generate_public_uid


class PostgresUserStore:
    def __init__(self, sm: async_sessionmaker[AsyncSession]) -> None:
        self._sm = sm

    def _to_stored(self, row: UserRow) -> StoredUser:
        return StoredUser(
            id=str(row.id),
            email=row.email,
            username=row.username,
            uid=row.uid,
            password_hash=row.password_hash,
            is_email_verified=row.is_email_verified,
            phone=row.phone,
            is_phone_verified=row.is_phone_verified,
        )

    async def create(self, email: str, password: str, username: str, *, auto_verify: bool) -> StoredUser:
        key = email.lower().strip()
        async with self._sm() as session:
            existing = await session.scalar(
                select(UserRow).where(func.lower(UserRow.email) == key)
            )
            if existing is not None:
                raise ValueError("EMAIL_EXISTS")
            row = UserRow(
                id=uuid.uuid4(),
                email=key,
                username=username.strip(),
                uid=generate_public_uid(),
                password_hash=hash_password(password),
                is_email_verified=auto_verify,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._to_stored(row)

    async def get_by_email(self, email: str) -> StoredUser | None:
        key = email.lower().strip()
        async with self._sm() as session:
            row = await session.scalar(select(UserRow).where(func.lower(UserRow.email) == key))
            return self._to_stored(row) if row else None

    async def get_by_username(self, username: str) -> StoredUser | None:
        key = username.strip().lstrip("$").lower()
        if not key:
            return None
        async with self._sm() as session:
            row = await session.scalar(select(UserRow).where(func.lower(UserRow.username) == key))
            return self._to_stored(row) if row else None

    async def get_by_identifier(self, identifier: str) -> StoredUser | None:
        # An identifier is an email if it contains "@", otherwise a username.
        ident = identifier.strip()
        if "@" in ident:
            return await self.get_by_email(ident)
        return await self.get_by_username(ident)

    async def get_by_id(self, user_id: str) -> StoredUser | None:
        async with self._sm() as session:
            try:
                uid = uuid.UUID(user_id)
            except ValueError:
                return None
            row = await session.scalar(select(UserRow).where(UserRow.id == uid))
            return self._to_stored(row) if row else None

    async def verify_credentials(self, email: str, password: str) -> StoredUser | None:
        user = await self.get_by_email(email)
        if not user or not verify_password(user.password_hash, password):
            return None
        return user

    async def verify_credentials_by_identifier(
        self, identifier: str, password: str
    ) -> StoredUser | None:
        user = await self.get_by_identifier(identifier)
        if not user or not verify_password(user.password_hash, password):
            return None
        return user

    async def mark_email_verified(self, email: str) -> None:
        key = email.lower().strip()
        async with self._sm() as session:
            await session.execute(
                update(UserRow)
                .where(func.lower(UserRow.email) == key)
                .values(is_email_verified=True)
            )
            await session.commit()

    async def update_password(self, email: str, password: str) -> bool:
        key = email.lower().strip()
        async with self._sm() as session:
            result = await session.execute(
                update(UserRow)
                .where(func.lower(UserRow.email) == key)
                .values(password_hash=hash_password(password))
                .returning(UserRow.id)
            )
            await session.commit()
            return result.scalar_one_or_none() is not None

    async def change_password(self, user_id: str, current_password: str, new_password: str) -> bool:
        user = await self.get_by_id(user_id)
        if not user or not verify_password(user.password_hash, current_password):
            return False
        async with self._sm() as session:
            await session.execute(
                update(UserRow)
                .where(UserRow.id == uuid.UUID(user_id))
                .values(password_hash=hash_password(new_password))
            )
            await session.commit()
        return True

    async def set_phone(self, user_id: str, phone: str, *, verified: bool) -> bool:
        async with self._sm() as session:
            result = await session.execute(
                update(UserRow)
                .where(UserRow.id == uuid.UUID(user_id))
                .values(phone=phone.strip(), is_phone_verified=verified)
                .returning(UserRow.id)
            )
            await session.commit()
            return result.scalar_one_or_none() is not None

    async def get_or_create_oauth_user(
        self,
        provider: str,
        subject: str,
        email: str,
        username: str,
    ) -> StoredUser:
        key = email.lower().strip()
        async with self._sm() as session:
            row = await session.scalar(select(UserRow).where(func.lower(UserRow.email) == key))
            if row:
                row.is_email_verified = True
                safe = username.strip()[:64] if username else ""
                if safe and row.username != safe:
                    row.username = safe
                await session.commit()
                await session.refresh(row)
                return self._to_stored(row)
            safe_name = (username or f"{provider}_user").strip()[:64]
            row = UserRow(
                id=uuid.uuid4(),
                email=key,
                username=safe_name,
                uid=generate_public_uid(),
                password_hash=hash_password(secrets.token_urlsafe(48)),
                is_email_verified=True,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._to_stored(row)

    async def delete_user(self, user_id: str) -> bool:
        async with self._sm() as session:
            result = await session.execute(
                delete(UserRow).where(UserRow.id == uuid.UUID(user_id)).returning(UserRow.id)
            )
            await session.commit()
            return result.scalar_one_or_none() is not None


class PostgresSessionStore:
    def __init__(self, sm: async_sessionmaker[AsyncSession]) -> None:
        self._sm = sm

    def _to_stored(self, row: SessionRow) -> StoredSession:
        return StoredSession(
            id=str(row.id),
            user_id=str(row.user_id),
            device_label=row.device_label,
            refresh_token_hash=row.refresh_token_hash,
            refresh_family_id=str(row.refresh_family_id),
            created_at=row.created_at,
            last_used_at=row.last_used_at,
            revoked=row.revoked,
            ip_hint=row.ip_hint,
            device_fingerprint=row.device_fingerprint,
        )

    async def create_session(
        self,
        user_id: str,
        raw_refresh: str,
        *,
        device_label: str = "Unknown device",
        ip_hint: str | None = None,
        device_fingerprint: str = "",
    ) -> StoredSession:
        family_id = uuid.uuid4()
        async with self._sm() as session:
            row = SessionRow(
                id=uuid.uuid4(),
                user_id=uuid.UUID(user_id),
                device_label=device_label,
                refresh_token_hash=hash_refresh_token(raw_refresh),
                refresh_family_id=family_id,
                ip_hint=ip_hint,
                device_fingerprint=device_fingerprint,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._to_stored(row)

    async def get_session(self, session_id: str) -> StoredSession | None:
        async with self._sm() as session:
            row = await session.scalar(
                select(SessionRow).where(
                    SessionRow.id == uuid.UUID(session_id),
                    SessionRow.revoked.is_(False),
                )
            )
            return self._to_stored(row) if row else None

    async def list_user_sessions(self, user_id: str) -> list[StoredSession]:
        async with self._sm() as session:
            rows = await session.scalars(
                select(SessionRow).where(
                    SessionRow.user_id == uuid.UUID(user_id),
                    SessionRow.revoked.is_(False),
                )
            )
            return [self._to_stored(r) for r in rows]

    async def revoke_session(self, session_id: str) -> bool:
        async with self._sm() as session:
            result = await session.execute(
                update(SessionRow)
                .where(SessionRow.id == uuid.UUID(session_id))
                .values(revoked=True)
                .returning(SessionRow.id)
            )
            await session.commit()
            return result.scalar_one_or_none() is not None

    async def revoke_other_sessions(self, user_id: str, except_session_id: str) -> int:
        async with self._sm() as session:
            result = await session.execute(
                update(SessionRow)
                .where(
                    SessionRow.user_id == uuid.UUID(user_id),
                    SessionRow.id != uuid.UUID(except_session_id),
                    SessionRow.revoked.is_(False),
                )
                .values(revoked=True)
                .returning(SessionRow.id)
            )
            await session.commit()
            return len(result.fetchall())

    async def revoke_family(self, family_id: str) -> None:
        async with self._sm() as session:
            await session.execute(
                update(SessionRow)
                .where(SessionRow.refresh_family_id == uuid.UUID(family_id))
                .values(revoked=True)
            )
            await session.commit()

    async def rotate_refresh(self, session_id: str, new_raw_refresh: str) -> StoredSession | None:
        async with self._sm() as session:
            row = await session.scalar(
                select(SessionRow).where(
                    SessionRow.id == uuid.UUID(session_id),
                    SessionRow.revoked.is_(False),
                )
            )
            if not row:
                return None
            row.refresh_token_hash = hash_refresh_token(new_raw_refresh)
            row.last_used_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(row)
            return self._to_stored(row)

    async def find_by_refresh_hash(self, raw_refresh: str) -> StoredSession | None:
        h = hash_refresh_token(raw_refresh)
        async with self._sm() as session:
            row = await session.scalar(
                select(SessionRow).where(
                    SessionRow.refresh_token_hash == h,
                    SessionRow.revoked.is_(False),
                )
            )
            return self._to_stored(row) if row else None

    async def find_revoked_by_refresh(self, raw_refresh: str) -> StoredSession | None:
        h = hash_refresh_token(raw_refresh)
        async with self._sm() as session:
            row = await session.scalar(
                select(SessionRow).where(
                    SessionRow.refresh_token_hash == h,
                    SessionRow.revoked.is_(True),
                )
            )
            return self._to_stored(row) if row else None

    async def create_qr(self, token: str, expires_at: datetime) -> QrLoginSession:
        async with self._sm() as session:
            row = QrSessionRow(
                id=uuid.uuid4(),
                token=token,
                status="pending",
                expires_at=expires_at,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._qr_to_stored(row)

    async def get_qr(self, token: str) -> QrLoginSession | None:
        async with self._sm() as session:
            row = await session.scalar(select(QrSessionRow).where(QrSessionRow.token == token))
            return self._qr_to_stored(row) if row else None

    async def consume_qr_refresh(self, token: str) -> None:
        """One-time read: null the plaintext refresh token on the QR row once the
        paired device has received it, so it is not left at rest in the DB."""
        async with self._sm() as session:
            row = await session.scalar(select(QrSessionRow).where(QrSessionRow.token == token))
            if row is not None and row.refresh_token_raw is not None:
                row.refresh_token_raw = None
                await session.commit()

    async def approve_qr(
        self,
        token: str,
        user_id: str,
        session_id: str,
        *,
        refresh_token_raw: str | None = None,
    ) -> QrLoginSession | None:
        async with self._sm() as session:
            row = await session.scalar(
                select(QrSessionRow).where(QrSessionRow.token == token)
            )
            if not row or row.status != "pending":
                return None
            if datetime.now(UTC) > row.expires_at.replace(tzinfo=UTC):
                row.status = "expired"
                await session.commit()
                return None
            row.status = "approved"
            row.user_id = uuid.UUID(user_id)
            row.session_id = uuid.UUID(session_id)
            row.refresh_token_raw = refresh_token_raw
            await session.commit()
            await session.refresh(row)
            return self._qr_to_stored(row)

    def _qr_to_stored(self, row: QrSessionRow) -> QrLoginSession:
        return QrLoginSession(
            id=str(row.id),
            token=row.token,
            status=row.status,
            created_at=row.created_at,
            expires_at=row.expires_at,
            user_id=str(row.user_id) if row.user_id else None,
            session_id=str(row.session_id) if row.session_id else None,
            refresh_token_raw=row.refresh_token_raw,
        )


class PostgresVerificationStore:
    def __init__(self, sm: async_sessionmaker[AsyncSession]) -> None:
        self._sm = sm

    async def issue_email_code(self, email: str, *, ttl_minutes: int = 30) -> str:
        key = email.lower().strip()
        code = f"{secrets.randbelow(900000) + 100000:06d}"
        expires = datetime.now(UTC) + timedelta(minutes=ttl_minutes)
        async with self._sm() as session:
            existing = await session.scalar(
                select(EmailVerificationCodeRow).where(EmailVerificationCodeRow.email == key)
            )
            if existing:
                existing.code = code
                existing.expires_at = expires
            else:
                session.add(EmailVerificationCodeRow(email=key, code=code, expires_at=expires))
            await session.commit()
        return code

    async def consume_email_code(self, email: str, code: str) -> bool:
        key = email.lower().strip()
        async with self._sm() as session:
            row = await session.scalar(
                select(EmailVerificationCodeRow).where(EmailVerificationCodeRow.email == key)
            )
            if not row or datetime.now(UTC) > row.expires_at.replace(tzinfo=UTC):
                if row:
                    await session.delete(row)
                    await session.commit()
                return False
            if row.code != code.strip():
                return False
            await session.delete(row)
            await session.commit()
            return True

    async def issue_reset_token(self, email: str, *, ttl_minutes: int = 60) -> str:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(UTC) + timedelta(minutes=ttl_minutes)
        async with self._sm() as session:
            session.add(PasswordResetTokenRow(token=token, email=email.lower().strip(), expires_at=expires))
            await session.commit()
        return token

    async def consume_reset_token(self, token: str) -> str | None:
        async with self._sm() as session:
            row = await session.scalar(
                select(PasswordResetTokenRow).where(PasswordResetTokenRow.token == token)
            )
            if not row or datetime.now(UTC) > row.expires_at.replace(tzinfo=UTC):
                if row:
                    await session.delete(row)
                    await session.commit()
                return None
            email = row.email
            await session.delete(row)
            await session.commit()
            return email

    async def issue_phone_otp(self, user_id: str, phone: str, *, ttl_minutes: int = 10) -> str:
        code = f"{secrets.randbelow(900000) + 100000:06d}"
        expires = datetime.now(UTC) + timedelta(minutes=ttl_minutes)
        async with self._sm() as session:
            existing = await session.scalar(
                select(PhoneOtpCodeRow).where(PhoneOtpCodeRow.user_id == user_id)
            )
            if existing:
                existing.phone = phone.strip()
                existing.code = code
                existing.expires_at = expires
            else:
                session.add(
                    PhoneOtpCodeRow(user_id=user_id, phone=phone.strip(), code=code, expires_at=expires)
                )
            await session.commit()
        return code

    async def consume_phone_otp(self, user_id: str, phone: str, code: str) -> bool:
        async with self._sm() as session:
            row = await session.scalar(
                select(PhoneOtpCodeRow).where(PhoneOtpCodeRow.user_id == user_id)
            )
            if not row or datetime.now(UTC) > row.expires_at.replace(tzinfo=UTC):
                if row:
                    await session.delete(row)
                    await session.commit()
                return False
            if row.phone != phone.strip() or row.code != code.strip():
                return False
            await session.delete(row)
            await session.commit()
            return True
