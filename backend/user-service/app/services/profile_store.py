from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Literal

from nexa_shared.utils.uid import generate_public_uid

VerificationBadge = Literal["none", "verified", "official", "bot"]
AvatarKind = Literal["initial", "image", "animated"]

# A client heartbeats presence every ~60s. Treat a user as online only while that
# heartbeat is fresh: a sticky `is_online=True` left behind by a killed tab, crash
# or dropped connection (no explicit offline ping) must NOT show green forever.
ONLINE_TTL_SECONDS = 90


def effective_online(is_online: bool, last_seen_at: datetime | None) -> bool:
    """Online only if the flag is set AND the last activity is recent."""
    if not is_online or last_seen_at is None:
        return False
    seen = last_seen_at if last_seen_at.tzinfo else last_seen_at.replace(tzinfo=UTC)
    return (datetime.now(UTC) - seen) < timedelta(seconds=ONLINE_TTL_SECONDS)


@dataclass
class ProfilePrivacy:
    show_last_seen: bool = True
    show_online_status: bool = True
    show_bio: bool = True
    show_status_text: bool = True
    show_avatar: bool = True
    allow_search_by_username: bool = True


@dataclass
class Profile:
    id: str
    username: str
    uid: str
    nickname: str = ""
    bio: str = ""
    status_text: str = ""
    avatar_url: str | None = None
    animated_avatar_url: str | None = None
    avatar_kind: AvatarKind = "initial"
    is_online: bool = False
    last_seen_at: datetime | None = None
    verification_badge: VerificationBadge = "none"
    privacy: ProfilePrivacy = field(default_factory=ProfilePrivacy)
    ecdh_public_key: str | None = None


@dataclass
class ProfileStore:
    _by_id: dict[str, Profile] = field(default_factory=dict)
    _username_index: dict[str, str] = field(default_factory=dict)

    async def bootstrap(self, user_id: str, username: str, *, nickname: str | None = None) -> Profile:
        existing = self._by_id.get(user_id)
        clean = username.strip().lstrip("$")[:64] or f"user_{user_id[:8]}"
        if existing:
            if clean and existing.username != clean:
                key = clean.lower()
                if key not in self._username_index or self._username_index[key] == user_id:
                    self._username_index.pop(existing.username.lower(), None)
                    existing.username = clean
                    self._username_index[key] = user_id
            if nickname is not None and nickname.strip():
                existing.nickname = nickname.strip()[:64]
            return existing
        return await self.ensure_profile(user_id, clean)

    async def clear_avatar(self, user_id: str) -> Profile | None:
        p = self._by_id.get(user_id)
        if not p:
            return None
        p.avatar_url = None
        p.animated_avatar_url = None
        p.avatar_kind = "initial"
        return p

    async def ensure_profile(self, user_id: str, username: str) -> Profile:
        if user_id in self._by_id:
            return self._by_id[user_id]
        key = username.lower()
        if key in self._username_index and self._username_index[key] != user_id:
            username = f"{username}_{user_id[:6]}"
            key = username.lower()
        profile = Profile(
            id=user_id,
            username=username,
            uid=generate_public_uid(),
            verification_badge="verified" if username.lower() in ("alex", "maria") else "none",
        )
        self._by_id[user_id] = profile
        self._username_index[key] = user_id
        return profile

    async def get(self, user_id: str) -> Profile | None:
        return self._by_id.get(user_id)

    async def get_by_username(self, username: str) -> Profile | None:
        uid = self._username_index.get(username.lower().strip().lstrip("$"))
        return self._by_id.get(uid) if uid else None

    async def search(self, query: str, limit: int = 20) -> list[Profile]:
        q = query.lower().strip().lstrip("$")
        if not q:
            return []
        results: list[Profile] = []
        for p in self._by_id.values():
            if not p.privacy.allow_search_by_username:
                continue
            hay = f"{p.username} {p.nickname} {p.uid}".lower()
            if q in hay:
                results.append(p)
            if len(results) >= limit:
                break
        return results

    async def update(self, user_id: str, **fields) -> Profile | None:
        p = self._by_id.get(user_id)
        if not p:
            return None
        if "username" in fields and fields["username"] is not None:
            new_name = fields["username"].strip()
            key = new_name.lower()
            if key in self._username_index and self._username_index[key] != user_id:
                raise ValueError("USERNAME_TAKEN")
            self._username_index.pop(p.username.lower(), None)
            p.username = new_name
            self._username_index[key] = user_id
        if "nickname" in fields and fields["nickname"] is not None:
            p.nickname = fields["nickname"].strip()[:64]
        if "bio" in fields and fields["bio"] is not None:
            p.bio = fields["bio"]
        if "status_text" in fields and fields["status_text"] is not None:
            p.status_text = fields["status_text"]
        if "avatar_url" in fields:
            p.avatar_url = fields["avatar_url"]
        if "animated_avatar_url" in fields:
            p.animated_avatar_url = fields["animated_avatar_url"]
        if "avatar_kind" in fields and fields["avatar_kind"] is not None:
            p.avatar_kind = fields["avatar_kind"]
        if "privacy" in fields and fields["privacy"] is not None:
            priv = fields["privacy"]
            if isinstance(priv, ProfilePrivacy):
                p.privacy = priv
            else:
                p.privacy = ProfilePrivacy(**priv) if isinstance(priv, dict) else priv
        return p

    async def update_public_key(self, user_id: str, ecdh_public_key: str) -> Profile | None:
        p = self._by_id.get(user_id)
        if not p:
            return None
        p.ecdh_public_key = ecdh_public_key
        return p

    async def set_presence(self, user_id: str, *, is_online: bool, status_text: str | None = None) -> Profile | None:
        p = self._by_id.get(user_id)
        if not p:
            return None
        p.is_online = is_online
        if status_text is not None:
            p.status_text = status_text
        # Always stamp last activity — every heartbeat (online) and the explicit
        # offline ping. Reads derive freshness from this so presence self-expires.
        p.last_seen_at = datetime.now(UTC)
        return p

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


class _ProfileStoreProxy:
    """Starts in-memory; call _switch_to_postgres() in lifespan to use Postgres."""

    def __init__(self) -> None:
        self._impl: ProfileStore = ProfileStore()
        self._typing: dict[str, set[str]] = {}

    def _switch_to_postgres(self, pg) -> None:
        self._impl = pg

    def set_typing(self, user_id: str, conversation_id: str, is_typing: bool) -> None:
        s = self._typing.setdefault(conversation_id, set())
        if is_typing:
            s.add(user_id)
        else:
            s.discard(user_id)

    def get_typing(self, conversation_id: str) -> list[str]:
        return list(self._typing.get(conversation_id, set()))

    def __getattr__(self, name: str):
        return getattr(self._impl, name)


profile_store = _ProfileStoreProxy()
