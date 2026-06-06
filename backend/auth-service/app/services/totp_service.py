"""TOTP 2FA and backup codes."""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field

import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher()


@dataclass
class TotpState:
    secret: str | None = None
    enabled: bool = False
    backup_hashes: list[str] = field(default_factory=list)


@dataclass
class TotpStore:
    _by_user: dict[str, TotpState] = field(default_factory=dict)

    def get(self, user_id: str) -> TotpState:
        return self._by_user.setdefault(user_id, TotpState())

    def start_setup(self, user_id: str, *, issuer: str = "Nexa") -> tuple[str, str]:
        state = self.get(user_id)
        state.secret = pyotp.random_base32()
        totp = pyotp.TOTP(state.secret)
        uri = totp.provisioning_uri(name=user_id, issuer_name=issuer)
        return state.secret, uri

    def confirm_setup(self, user_id: str, code: str) -> list[str] | None:
        state = self.get(user_id)
        if not state.secret:
            return None
        totp = pyotp.TOTP(state.secret)
        if not totp.verify(code, valid_window=1):
            return None
        state.enabled = True
        plain_codes = [secrets.token_hex(4) for _ in range(8)]
        state.backup_hashes = [_hash_backup(c) for c in plain_codes]
        return plain_codes

    def verify(self, user_id: str, code: str) -> bool:
        state = self.get(user_id)
        if not state.enabled or not state.secret:
            return False
        if pyotp.TOTP(state.secret).verify(code, valid_window=1):
            return True
        return self._consume_backup(state, code)

    def _consume_backup(self, state: TotpState, code: str) -> bool:
        normalized = code.replace("-", "").strip().lower()
        for i, h in enumerate(state.backup_hashes):
            try:
                if _hasher.verify(h, normalized):
                    state.backup_hashes.pop(i)
                    return True
            except VerifyMismatchError:
                continue
        return False

    def is_enabled(self, user_id: str) -> bool:
        return self.get(user_id).enabled

    def disable(self, user_id: str, code: str) -> bool:
        state = self.get(user_id)
        if not state.enabled:
            return True
        if not self.verify(user_id, code):
            return False
        state.enabled = False
        state.secret = None
        state.backup_hashes = []
        return True

    def backup_codes_plain(self, user_id: str) -> list[str]:
        """Only available immediately after confirm_setup — dev returns empty."""
        return []

    def purge_user(self, user_id: str) -> None:
        self._by_user.pop(user_id, None)


def _hash_backup(code: str) -> str:
    return _hasher.hash(code)


totp_store = TotpStore()
