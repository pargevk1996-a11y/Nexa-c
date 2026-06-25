"""User store — in-memory (dev/tests) with transparent Postgres proxy."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import uuid4

from nexa_shared.security.passwords import hash_password, verify_password
from nexa_shared.utils.uid import generate_public_uid


@dataclass
class StoredUser:
    id: str
    email: str | None
    username: str
    uid: str
    password_hash: str
    is_email_verified: bool = False
    phone: str | None = None
    is_phone_verified: bool = False
    pin_hash: str | None = None
    pin_status: str = "PENDING_PIN"


@dataclass
class UserStore:
    _by_email: dict[str, StoredUser] = field(default_factory=dict)
    _by_id: dict[str, StoredUser] = field(default_factory=dict)

    async def create(self, email: str | None, password: str, username: str, *, auto_verify: bool) -> StoredUser:
        ukey = username.strip().lower()
        for u in self._by_id.values():
            if u.username.lower() == ukey:
                raise ValueError("USERNAME_EXISTS")
        if email is not None:
            ekey = email.lower().strip()
            if ekey in self._by_email:
                raise ValueError("EMAIL_EXISTS")
        else:
            ekey = None
        user = StoredUser(
            id=str(uuid4()),
            email=ekey,
            username=username.strip(),
            uid=generate_public_uid(),
            password_hash=hash_password(password),
            is_email_verified=auto_verify or email is None,
        )
        if ekey is not None:
            self._by_email[ekey] = user
        self._by_id[user.id] = user
        return user

    async def get_by_email(self, email: str) -> StoredUser | None:
        return self._by_email.get(email.lower().strip())

    async def get_by_username(self, username: str) -> StoredUser | None:
        key = username.strip().lstrip("$").lower()
        if not key:
            return None
        for user in self._by_id.values():
            if user.username.lower() == key:
                return user
        return None

    async def get_by_identifier(self, identifier: str) -> StoredUser | None:
        ident = identifier.strip()
        if "@" in ident:
            return await self.get_by_email(ident)
        return await self.get_by_username(ident)

    async def get_by_id(self, user_id: str) -> StoredUser | None:
        return self._by_id.get(user_id)

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
        user = await self.get_by_email(email)
        if user:
            user.is_email_verified = True

    async def update_password(self, email: str, password: str) -> bool:
        user = await self.get_by_email(email)
        if not user:
            return False
        user.password_hash = hash_password(password)
        return True

    async def change_password(self, user_id: str, current_password: str, new_password: str) -> bool:
        user = await self.get_by_id(user_id)
        if not user or not verify_password(user.password_hash, current_password):
            return False
        user.password_hash = hash_password(new_password)
        return True

    async def set_phone(self, user_id: str, phone: str, *, verified: bool) -> bool:
        user = await self.get_by_id(user_id)
        if not user:
            return False
        user.phone = phone.strip()
        user.is_phone_verified = verified
        return True

    async def get_or_create_oauth_user(
        self,
        provider: str,
        subject: str,
        email: str,
        username: str,
        *,
        mode: str = "login",
    ) -> StoredUser:
        """
        Register (mode='register') or sign in (mode='login') via OAuth.
        register: create account if new; raise ValueError('account_exists') if already registered.
        login:    find existing account; raise ValueError('account_not_found') if none.
        """
        import secrets as _secrets
        key = email.lower().strip()
        existing = self._by_email.get(key)

        if mode == "register":
            if existing:
                raise ValueError("account_exists")
            safe_name = (username.strip()[:64] if username else "") or key.split("@")[0][:64]
            user = StoredUser(
                id=str(uuid4()),
                email=key,
                username=safe_name,
                uid=generate_public_uid(),
                password_hash=hash_password(_secrets.token_urlsafe(32)),
                is_email_verified=True,
            )
            self._by_email[key] = user
            self._by_id[user.id] = user
            return user

        # mode == "login"
        if not existing:
            raise ValueError("account_not_found")
        existing.is_email_verified = True
        if username and existing.username != username:
            existing.username = username.strip()[:64]
        return existing

    async def set_pin(self, user_id: str, pin_hash: str) -> bool:
        user = await self.get_by_id(user_id)
        if not user:
            return False
        user.pin_hash = pin_hash
        user.pin_status = "ACTIVE"
        return True

    async def delete_user(self, user_id: str) -> bool:
        user = self._by_id.pop(user_id, None)
        if user is None:
            return False
        if user.email is not None:
            self._by_email.pop(user.email, None)
        return True


class _UserStoreProxy:
    """Starts in-memory; call _switch_to_postgres() in lifespan to use Postgres."""

    def __init__(self) -> None:
        self._impl: UserStore = UserStore()

    def _switch_to_postgres(self, pg) -> None:
        self._impl = pg

    def __getattr__(self, name: str):
        return getattr(self._impl, name)


store = _UserStoreProxy()
