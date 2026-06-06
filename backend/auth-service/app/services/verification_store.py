"""Verification store — in-memory (dev/tests) with transparent Postgres proxy."""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta


@dataclass
class EmailVerifyEntry:
    email: str
    code: str
    expires_at: datetime


@dataclass
class PasswordResetEntry:
    email: str
    expires_at: datetime


@dataclass
class PhoneOtpEntry:
    user_id: str
    phone: str
    code: str
    expires_at: datetime


@dataclass
class VerificationStore:
    _email_codes: dict[str, EmailVerifyEntry] = field(default_factory=dict)
    _reset_tokens: dict[str, PasswordResetEntry] = field(default_factory=dict)
    _phone_otp: dict[str, PhoneOtpEntry] = field(default_factory=dict)

    async def issue_email_code(self, email: str, *, ttl_minutes: int = 30) -> str:
        code = f"{secrets.randbelow(900000) + 100000:06d}"
        self._email_codes[email.lower().strip()] = EmailVerifyEntry(
            email=email.lower().strip(),
            code=code,
            expires_at=datetime.now(UTC) + timedelta(minutes=ttl_minutes),
        )
        return code

    async def consume_email_code(self, email: str, code: str) -> bool:
        key = email.lower().strip()
        entry = self._email_codes.get(key)
        if not entry or datetime.now(UTC) > entry.expires_at:
            self._email_codes.pop(key, None)
            return False
        if entry.code != code.strip():
            return False
        del self._email_codes[key]
        return True

    async def issue_reset_token(self, email: str, *, ttl_minutes: int = 60) -> str:
        token = secrets.token_urlsafe(32)
        self._reset_tokens[token] = PasswordResetEntry(
            email=email.lower().strip(),
            expires_at=datetime.now(UTC) + timedelta(minutes=ttl_minutes),
        )
        return token

    async def consume_reset_token(self, token: str) -> str | None:
        entry = self._reset_tokens.get(token)
        if not entry or datetime.now(UTC) > entry.expires_at:
            self._reset_tokens.pop(token, None)
            return None
        del self._reset_tokens[token]
        return entry.email

    async def issue_phone_otp(self, user_id: str, phone: str, *, ttl_minutes: int = 10) -> str:
        code = f"{secrets.randbelow(900000) + 100000:06d}"
        self._phone_otp[user_id] = PhoneOtpEntry(
            user_id=user_id,
            phone=phone.strip(),
            code=code,
            expires_at=datetime.now(UTC) + timedelta(minutes=ttl_minutes),
        )
        return code

    async def consume_phone_otp(self, user_id: str, phone: str, code: str) -> bool:
        entry = self._phone_otp.get(user_id)
        if not entry or datetime.now(UTC) > entry.expires_at:
            self._phone_otp.pop(user_id, None)
            return False
        if entry.phone != phone.strip() or entry.code != code.strip():
            return False
        del self._phone_otp[user_id]
        return True


class _VerificationStoreProxy:
    """Starts in-memory; call _switch_to_postgres() in lifespan to use Postgres."""

    def __init__(self) -> None:
        self._impl: VerificationStore = VerificationStore()

    def _switch_to_postgres(self, pg) -> None:
        self._impl = pg

    def __getattr__(self, name: str):
        return getattr(self._impl, name)


verification_store = _VerificationStoreProxy()
