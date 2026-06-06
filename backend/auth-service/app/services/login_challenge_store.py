"""Short-lived tokens between password login and 2FA verification."""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta


@dataclass
class PendingLogin:
    user_id: str
    email: str
    expires_at: datetime
    device_label: str
    ip_hint: str | None


@dataclass
class LoginChallengeStore:
    _pending: dict[str, PendingLogin] = field(default_factory=dict)
    ttl_seconds: int = 300

    def create(self, user_id: str, email: str, *, device_label: str, ip_hint: str | None) -> str:
        token = secrets.token_urlsafe(32)
        self._pending[token] = PendingLogin(
            user_id=user_id,
            email=email,
            expires_at=datetime.now(UTC) + timedelta(seconds=self.ttl_seconds),
            device_label=device_label,
            ip_hint=ip_hint,
        )
        return token

    def consume(self, token: str) -> PendingLogin | None:
        pending = self._pending.pop(token, None)
        if not pending:
            return None
        if datetime.now(UTC) > pending.expires_at:
            return None
        return pending


login_challenge_store = LoginChallengeStore()
