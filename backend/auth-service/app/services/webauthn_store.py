"""WebAuthn credential storage (dev in-memory)."""

from dataclasses import dataclass, field
from uuid import uuid4


@dataclass
class StoredCredential:
    id: str
    user_id: str
    credential_id: str
    public_key: str
    device_label: str
    sign_count: int = 0


@dataclass
class WebAuthnStore:
    _credentials: dict[str, StoredCredential] = field(default_factory=dict)
    _challenges: dict[str, str] = field(default_factory=dict)

    def register(
        self,
        user_id: str,
        credential_id: str,
        public_key: str,
        *,
        device_label: str = "Biometric device",
    ) -> StoredCredential:
        cred = StoredCredential(
            id=str(uuid4()),
            user_id=user_id,
            credential_id=credential_id,
            public_key=public_key,
            device_label=device_label,
        )
        self._credentials[cred.credential_id] = cred
        return cred

    def list_for_user(self, user_id: str) -> list[StoredCredential]:
        return [c for c in self._credentials.values() if c.user_id == user_id]

    def count_for_user(self, user_id: str) -> int:
        return len(self.list_for_user(user_id))

    def get_by_credential_id(self, credential_id: str) -> StoredCredential | None:
        return self._credentials.get(credential_id)

    def remove_for_user(self, user_id: str) -> int:
        to_remove = [cid for cid, c in self._credentials.items() if c.user_id == user_id]
        for cid in to_remove:
            del self._credentials[cid]
        return len(to_remove)

    def issue_challenge(self, email: str) -> str:
        import secrets

        challenge = secrets.token_urlsafe(32)
        self._challenges[email.lower().strip()] = challenge
        return challenge

    def consume_challenge(self, email: str, challenge: str) -> bool:
        key = email.lower().strip()
        expected = self._challenges.pop(key, None)
        return expected is not None and expected == challenge


webauthn_store = WebAuthnStore()
