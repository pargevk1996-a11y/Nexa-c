"""Session store — in-memory (dev/tests) with transparent Postgres proxy."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4

from nexa_shared.security.tokens import hash_refresh_token


@dataclass
class StoredSession:
    id: str
    user_id: str
    device_label: str
    refresh_token_hash: str
    refresh_family_id: str
    created_at: datetime
    last_used_at: datetime
    revoked: bool = False
    ip_hint: str | None = None
    device_fingerprint: str = ""


@dataclass
class QrLoginSession:
    id: str
    token: str
    status: str  # pending | approved | expired
    created_at: datetime
    expires_at: datetime
    user_id: str | None = None
    session_id: str | None = None
    refresh_token_raw: str | None = None


@dataclass
class SessionStore:
    _sessions: dict[str, StoredSession] = field(default_factory=dict)
    _by_refresh_hash: dict[str, str] = field(default_factory=dict)
    _qr: dict[str, QrLoginSession] = field(default_factory=dict)

    async def create_session(
        self,
        user_id: str,
        raw_refresh: str,
        *,
        device_label: str = "Unknown device",
        ip_hint: str | None = None,
        device_fingerprint: str = "",
    ) -> StoredSession:
        family_id = str(uuid4())
        session = StoredSession(
            id=str(uuid4()),
            user_id=user_id,
            device_label=device_label,
            refresh_token_hash=hash_refresh_token(raw_refresh),
            refresh_family_id=family_id,
            created_at=datetime.now(UTC),
            last_used_at=datetime.now(UTC),
            ip_hint=ip_hint,
            device_fingerprint=device_fingerprint,
        )
        self._sessions[session.id] = session
        self._by_refresh_hash[session.refresh_token_hash] = session.id
        return session

    async def get_session(self, session_id: str) -> StoredSession | None:
        s = self._sessions.get(session_id)
        if s and not s.revoked:
            return s
        return None

    async def list_user_sessions(self, user_id: str) -> list[StoredSession]:
        return [s for s in self._sessions.values() if s.user_id == user_id and not s.revoked]

    async def revoke_session(self, session_id: str) -> bool:
        s = self._sessions.get(session_id)
        if not s:
            return False
        s.revoked = True
        self._by_refresh_hash.pop(s.refresh_token_hash, None)
        return True

    async def revoke_other_sessions(self, user_id: str, except_session_id: str) -> int:
        count = 0
        for s in self._sessions.values():
            if s.user_id == user_id and not s.revoked and s.id != except_session_id:
                s.revoked = True
                self._by_refresh_hash.pop(s.refresh_token_hash, None)
                count += 1
        return count

    async def revoke_family(self, family_id: str) -> None:
        for s in self._sessions.values():
            if s.refresh_family_id == family_id:
                s.revoked = True
                self._by_refresh_hash.pop(s.refresh_token_hash, None)

    async def rotate_refresh(self, session_id: str, new_raw_refresh: str) -> StoredSession | None:
        s = self._sessions.get(session_id)
        if not s or s.revoked:
            return None
        self._by_refresh_hash.pop(s.refresh_token_hash, None)
        s.refresh_token_hash = hash_refresh_token(new_raw_refresh)
        s.last_used_at = datetime.now(UTC)
        self._by_refresh_hash[s.refresh_token_hash] = session_id
        return s

    async def find_by_refresh_hash(self, raw_refresh: str) -> StoredSession | None:
        sid = self._by_refresh_hash.get(hash_refresh_token(raw_refresh))
        if not sid:
            return None
        return await self.get_session(sid)

    async def find_revoked_by_refresh(self, raw_refresh: str) -> StoredSession | None:
        h = hash_refresh_token(raw_refresh)
        for s in self._sessions.values():
            if s.refresh_token_hash == h and s.revoked:
                return s
        return None

    async def create_qr(self, token: str, expires_at: datetime) -> QrLoginSession:
        qr = QrLoginSession(
            id=str(uuid4()),
            token=token,
            status="pending",
            created_at=datetime.now(UTC),
            expires_at=expires_at,
        )
        self._qr[qr.token] = qr
        return qr

    async def get_qr(self, token: str) -> QrLoginSession | None:
        return self._qr.get(token)

    async def approve_qr(
        self,
        token: str,
        user_id: str,
        session_id: str,
        *,
        refresh_token_raw: str | None = None,
    ) -> QrLoginSession | None:
        qr = self._qr.get(token)
        if not qr or qr.status != "pending":
            return None
        if datetime.now(UTC) > qr.expires_at:
            qr.status = "expired"
            return None
        qr.status = "approved"
        qr.user_id = user_id
        qr.session_id = session_id
        qr.refresh_token_raw = refresh_token_raw
        return qr

    async def consume_qr_refresh(self, token: str) -> None:
        """One-time read: clear the plaintext refresh token from the QR row once
        the paired device has consumed it, so it is not left at rest."""
        qr = self._qr.get(token)
        if qr:
            qr.refresh_token_raw = None


class _SessionStoreProxy:
    """Starts in-memory; call _switch_to_postgres() in lifespan to use Postgres."""

    def __init__(self) -> None:
        self._impl: SessionStore = SessionStore()

    def _switch_to_postgres(self, pg) -> None:
        self._impl = pg

    def __getattr__(self, name: str):
        return getattr(self._impl, name)


session_store = _SessionStoreProxy()
