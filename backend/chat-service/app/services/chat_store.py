"""In-memory chat store with groups, channels, communities, and moderation."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4

from app.domain.permissions import ROLE_MEMBER, ROLE_OWNER, rank
from app.domain.space_types import BROADCAST_TYPES, normalize_type
from app.services.message_crypto import maybe_decrypt_body, maybe_encrypt_body


@dataclass
class SpaceSettings:
    slow_mode_seconds: int = 0
    anti_spam_enabled: bool = True
    auto_mod_level: int = 1
    join_requires_verification: bool = False
    comments_enabled: bool = True
    invite_only: bool = False


@dataclass
class Member:
    user_id: str
    role: str = ROLE_MEMBER
    is_verified: bool = False
    joined_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class ModerationAction:
    id: str
    conversation_id: str
    actor_id: str
    action: str
    target_user_id: str | None
    target_message_id: str | None
    reason: str | None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class Conversation:
    id: str
    type: str
    title: str | None
    description: str | None
    slug: str | None
    is_public: bool
    verified: bool
    parent_id: str | None
    members: list[Member]
    settings: SpaceSettings
    pinned_message_ids: list[str] = field(default_factory=list)
    banned_user_ids: set[str] = field(default_factory=set)
    muted_until: dict[str, datetime] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    locked_for_user_id: str | None = None  # message content hidden for this user until unlocked


@dataclass
class Message:
    id: str
    conversation_id: str
    sender_id: str
    client_msg_id: str
    seq: int
    body: str
    content_type: str
    reply_to_id: str | None
    thread_root_id: str | None
    forward_from_id: str | None
    forward_blocked: bool
    media_id: str | None
    e2ee_envelope: dict | None
    expires_at: datetime | None
    edited_at: datetime | None
    deleted_for_everyone_at: datetime | None
    silent: bool
    reactions: dict[str, list[str]]
    created_at: datetime
    hidden_for: set[str] = field(default_factory=set)
    delivered_to: set[str] = field(default_factory=set)
    read_by: set[str] = field(default_factory=set)


@dataclass
class ChatStore:
    _conversations: dict[str, Conversation] = field(default_factory=dict)
    _messages: dict[str, Message] = field(default_factory=dict)
    _by_client_id: dict[tuple[str, str], str] = field(default_factory=dict)
    _seq: dict[str, int] = field(default_factory=dict)
    _mod_log: list[ModerationAction] = field(default_factory=list)
    _verified_users: set[str] = field(default_factory=set)
    _slugs: dict[str, str] = field(default_factory=dict)

    def mark_user_verified(self, user_id: str, *, verified: bool = True) -> None:
        if verified:
            self._verified_users.add(user_id)
        else:
            self._verified_users.discard(user_id)

    def is_user_verified(self, user_id: str) -> bool:
        return user_id in self._verified_users

    def _member(self, conv: Conversation, user_id: str) -> Member | None:
        for m in conv.members:
            if m.user_id == user_id:
                return m
        return None

    def log_mod(self, action: ModerationAction) -> None:
        self._mod_log.append(action)
        if len(self._mod_log) > 5000:
            self._mod_log = self._mod_log[-3000:]

    def mod_log(self, conv_id: str, limit: int = 50) -> list[ModerationAction]:
        items = [a for a in self._mod_log if a.conversation_id == conv_id]
        return list(reversed(items[-limit:]))

    async def unlock_conversation(self, conv_id: str) -> bool:
        conv = self._conversations.get(conv_id)
        if not conv:
            return False
        conv.locked_for_user_id = None
        return True

    async def archive_conversation(self, conv_id: str) -> bool:
        """Remove a conversation entirely (used when a contact request is declined)."""
        conv = self._conversations.pop(conv_id, None)
        if not conv:
            return False
        # Clean up slug index if present
        if conv.slug and conv.slug in self._slugs:
            del self._slugs[conv.slug]
        return True

    async def create_conversation(
        self,
        creator_id: str,
        *,
        type: str,
        title: str | None,
        member_ids: list[str],
        is_public: bool,
        description: str | None = None,
        slug: str | None = None,
        parent_id: str | None = None,
        verified: bool = False,
        settings: SpaceSettings | None = None,
        locked_for: str | None = None,
    ) -> Conversation:
        space_type = normalize_type(type, is_public=is_public)
        if slug:
            if slug in self._slugs:
                raise ValueError("SLUG_TAKEN")
            self._slugs[slug] = "pending"

        if parent_id:
            parent = self._conversations.get(parent_id)
            if not parent or parent.type != "community":
                raise ValueError("INVALID_PARENT")

        members = [Member(user_id=creator_id, role=ROLE_OWNER, is_verified=self.is_user_verified(creator_id))]
        for mid in member_ids:
            if mid != creator_id and not any(m.user_id == mid for m in members):
                members.append(
                    Member(user_id=mid, role=ROLE_MEMBER, is_verified=self.is_user_verified(mid))
                )

        default_settings = SpaceSettings()
        if space_type in BROADCAST_TYPES:
            default_settings.comments_enabled = True
        if space_type == "private_group":
            default_settings.invite_only = True

        conv = Conversation(
            id=str(uuid4()),
            type=space_type,
            title=title or _default_title(space_type, member_ids),
            description=description,
            slug=slug,
            is_public=is_public or space_type in ("public_group", "supergroup", "channel", "broadcast"),
            verified=verified,
            parent_id=parent_id,
            members=members,
            settings=settings or default_settings,
            locked_for_user_id=locked_for,
        )
        if slug:
            self._slugs[slug] = conv.id
        self._conversations[conv.id] = conv
        self._seq[conv.id] = 0
        return conv

    async def list_for_user(self, user_id: str) -> list[Conversation]:
        return [c for c in self._conversations.values() if self._member(c, user_id)]

    async def list_public(self, *, space_type: str | None = None, limit: int = 50) -> list[Conversation]:
        out = [c for c in self._conversations.values() if c.is_public and c.type != "dm"]
        if space_type:
            out = [c for c in out if c.type == space_type]
        out.sort(key=lambda c: c.created_at, reverse=True)
        return out[:limit]

    async def get_by_slug(self, slug: str) -> Conversation | None:
        cid = self._slugs.get(slug)
        return self._conversations.get(cid) if cid else None

    async def get_conversation(self, conv_id: str, user_id: str) -> Conversation | None:
        c = self._conversations.get(conv_id)
        if not c:
            return None
        if c.is_public and c.type != "dm":
            return c
        if self._member(c, user_id):
            return c
        return None

    async def get_conversation_member(self, conv_id: str, user_id: str) -> Conversation | None:
        c = self._conversations.get(conv_id)
        if not c or not self._member(c, user_id):
            return None
        return c

    async def join_public(self, conv_id: str, user_id: str) -> Conversation:
        conv = self._conversations.get(conv_id)
        if not conv or not conv.is_public:
            raise ValueError("NOT_FOUND")
        if user_id in conv.banned_user_ids:
            raise ValueError("BANNED")
        if conv.settings.join_requires_verification and not self.is_user_verified(user_id):
            raise ValueError("VERIFICATION_REQUIRED")
        if conv.settings.invite_only:
            raise ValueError("INVITE_ONLY")
        if not self._member(conv, user_id):
            conv.members.append(
                Member(user_id=user_id, role=ROLE_MEMBER, is_verified=self.is_user_verified(user_id))
            )
        return conv

    async def leave(self, conv_id: str, user_id: str) -> None:
        conv = self._conversations.get(conv_id)
        if not conv:
            raise ValueError("NOT_FOUND")
        member = self._member(conv, user_id)
        if not member:
            return
        if member.role == ROLE_OWNER and sum(1 for m in conv.members if m.role == ROLE_OWNER) <= 1:
            admins = [m for m in conv.members if rank(m.role) >= 3 and m.user_id != user_id]
            if admins:
                admins[0].role = ROLE_OWNER
            elif len(conv.members) > 1:
                conv.members[1].role = ROLE_OWNER
        conv.members = [m for m in conv.members if m.user_id != user_id]

    async def add_members(self, conv_id: str, user_ids: list[str]) -> None:
        conv = self._conversations.get(conv_id)
        if not conv:
            raise ValueError("NOT_FOUND")
        for uid in user_ids:
            if uid not in conv.banned_user_ids and not self._member(conv, uid):
                conv.members.append(
                    Member(user_id=uid, role=ROLE_MEMBER, is_verified=self.is_user_verified(uid))
                )

    async def set_member_role(self, conv_id: str, actor_id: str, target_id: str, role: str) -> Member:
        conv = self._conversations.get(conv_id)
        if not conv:
            raise ValueError("NOT_FOUND")
        actor = self._member(conv, actor_id)
        target = self._member(conv, target_id)
        if not actor or not target:
            raise ValueError("NOT_FOUND")
        if rank(actor.role) <= rank(target.role) and actor_id != target_id:
            raise ValueError("FORBIDDEN")
        if rank(role) >= rank(actor.role) and actor_id != target_id:
            raise ValueError("FORBIDDEN")
        target.role = role
        return target

    async def update_settings(self, conv_id: str, settings: SpaceSettings) -> Conversation:
        conv = self._conversations.get(conv_id)
        if not conv:
            raise ValueError("NOT_FOUND")
        conv.settings = settings
        return conv

    async def ban_user(self, conv_id: str, target_id: str) -> None:
        conv = self._conversations.get(conv_id)
        if not conv:
            raise ValueError("NOT_FOUND")
        conv.banned_user_ids.add(target_id)
        conv.members = [m for m in conv.members if m.user_id != target_id]
        conv.muted_until.pop(target_id, None)

    async def unban_user(self, conv_id: str, target_id: str) -> None:
        conv = self._conversations.get(conv_id)
        if not conv:
            raise ValueError("NOT_FOUND")
        conv.banned_user_ids.discard(target_id)

    async def mute_user(self, conv_id: str, target_id: str, *, until: datetime) -> None:
        conv = self._conversations.get(conv_id)
        if not conv:
            raise ValueError("NOT_FOUND")
        conv.muted_until[target_id] = until

    async def unmute_user(self, conv_id: str, target_id: str) -> None:
        conv = self._conversations.get(conv_id)
        if not conv:
            raise ValueError("NOT_FOUND")
        conv.muted_until.pop(target_id, None)

    async def list_channels_in_community(self, community_id: str) -> list[Conversation]:
        return [
            c
            for c in self._conversations.values()
            if c.parent_id == community_id and c.type in BROADCAST_TYPES
        ]

    async def send_message(
        self,
        conv_id: str,
        sender_id: str,
        *,
        client_msg_id: str,
        body: str,
        content_type: str = "text",
        reply_to_id: str | None = None,
        thread_root_id: str | None = None,
        forward_from_id: str | None = None,
        forward_blocked: bool = False,
        media_id: str | None = None,
        e2ee_envelope: dict | None = None,
        expires_at: datetime | None = None,
        silent: bool = False,
    ) -> tuple[Message, bool]:
        key = (conv_id, client_msg_id)
        if key in self._by_client_id:
            return self._messages[self._by_client_id[key]], False
        conv = self._conversations.get(conv_id)
        if not conv:
            raise ValueError("NOT_FOUND")
        if sender_id in conv.banned_user_ids:
            raise ValueError("BANNED")
        if forward_from_id:
            src = self._messages.get(forward_from_id)
            if src and src.forward_blocked:
                raise ValueError("FORWARD_BLOCKED")
        if thread_root_id:
            root = self._messages.get(thread_root_id)
            if not root or root.conversation_id != conv_id:
                raise ValueError("INVALID_THREAD")
        self._seq[conv_id] = self._seq.get(conv_id, 0) + 1
        msg = Message(
            id=str(uuid4()),
            conversation_id=conv_id,
            sender_id=sender_id,
            client_msg_id=client_msg_id,
            seq=self._seq[conv_id],
            body=maybe_encrypt_body(body),
            content_type=content_type,
            reply_to_id=reply_to_id,
            thread_root_id=thread_root_id,
            forward_from_id=forward_from_id,
            forward_blocked=forward_blocked,
            media_id=media_id,
            e2ee_envelope=e2ee_envelope,
            expires_at=expires_at,
            edited_at=None,
            deleted_for_everyone_at=None,
            silent=silent,
            reactions={},
            created_at=datetime.now(UTC),
        )
        self._messages[msg.id] = msg
        self._by_client_id[key] = msg.id
        return msg, True

    async def list_messages(
        self,
        conv_id: str,
        user_id: str,
        *,
        before_seq: int | None = None,
        after_seq: int | None = None,
        thread_root_id: str | None = None,
        main_timeline_only: bool = False,
        limit: int = 50,
    ) -> list[Message]:
        if not await self.get_conversation(conv_id, user_id):
            return []
        msgs = [
            m
            for m in self._messages.values()
            if m.conversation_id == conv_id
            and user_id not in m.hidden_for
            and m.deleted_for_everyone_at is None
        ]
        if thread_root_id is not None:
            msgs = [m for m in msgs if m.thread_root_id == thread_root_id or m.id == thread_root_id]
        elif main_timeline_only:
            msgs = [m for m in msgs if m.thread_root_id is None]
        if before_seq is not None:
            msgs = [m for m in msgs if m.seq < before_seq]
        if after_seq is not None:
            msgs = [m for m in msgs if m.seq > after_seq]
            msgs.sort(key=lambda m: m.seq)
            return msgs[:limit]
        msgs.sort(key=lambda m: m.seq, reverse=True)
        return list(reversed(msgs[:limit]))

    async def thread_reply_count(self, root_id: str) -> int:
        root = self._messages.get(root_id)
        if not root:
            return 0
        return sum(
            1
            for m in self._messages.values()
            if m.thread_root_id == root_id and m.deleted_for_everyone_at is None
        )

    async def get_message(self, msg_id: str, user_id: str) -> Message | None:
        m = self._messages.get(msg_id)
        if not m or not await self.get_conversation(m.conversation_id, user_id):
            return None
        return m

    async def edit_message(self, msg_id: str, user_id: str, body: str) -> Message | None:
        m = await self.get_message(msg_id, user_id)
        if not m or m.sender_id != user_id:
            return None
        m.body = maybe_encrypt_body(body)
        m.edited_at = datetime.now(UTC)
        return m

    async def delete_message(
        self, msg_id: str, user_id: str, *, for_everyone: bool, moderator: bool = False
    ) -> bool:
        m = await self.get_message(msg_id, user_id)
        if not m:
            return False
        if for_everyone:
            if not moderator and m.sender_id != user_id:
                return False
            m.deleted_for_everyone_at = datetime.now(UTC)
        else:
            m.hidden_for.add(user_id)
        return True

    async def add_reaction(self, msg_id: str, user_id: str, emoji: str) -> Message | None:
        m = await self.get_message(msg_id, user_id)
        if not m:
            return None
        users = m.reactions.setdefault(emoji, [])
        if user_id not in users:
            users.append(user_id)
        return m

    async def mark_delivered(self, msg_id: str, user_id: str) -> None:
        m = self._messages.get(msg_id)
        if m:
            m.delivered_to.add(user_id)

    async def mark_read(self, conv_id: str, user_id: str, up_to_seq: int) -> None:
        for m in self._messages.values():
            if m.conversation_id == conv_id and m.seq <= up_to_seq:
                m.read_by.add(user_id)
                m.delivered_to.add(user_id)

    async def pin_message(
        self, conv_id: str, user_id: str, message_id: str, pinned: bool
    ) -> Conversation | None:
        conv = await self.get_conversation_member(conv_id, user_id)
        if not conv:
            return None
        if pinned and message_id not in conv.pinned_message_ids:
            conv.pinned_message_ids.append(message_id)
        elif not pinned and message_id in conv.pinned_message_ids:
            conv.pinned_message_ids.remove(message_id)
        return conv

    async def get_latest_seq(self, conv_id: str) -> int:
        msgs = [m for m in self._messages.values() if m.conversation_id == conv_id]
        return max((m.seq for m in msgs), default=0)

    async def get_last_message_preview(self, conv_id: str) -> str | None:
        msgs = [
            m
            for m in self._messages.values()
            if m.conversation_id == conv_id and m.deleted_for_everyone_at is None
        ]
        if not msgs:
            return None
        last = max(msgs, key=lambda m: m.seq)
        return maybe_decrypt_body(last.body)[:80]

    async def get_unread_count(self, conv_id: str, user_id: str) -> int:
        return sum(
            1
            for m in self._messages.values()
            if m.conversation_id == conv_id
            and m.sender_id != user_id
            and user_id not in m.read_by
            and m.deleted_for_everyone_at is None
        )

    async def get_member_ids(self, conv_id: str, exclude: str | None = None) -> list[str]:
        conv = self._conversations.get(conv_id)
        if not conv:
            return []
        ids = [m.user_id for m in conv.members]
        if exclude:
            ids = [uid for uid in ids if uid != exclude]
        return ids


class _ChatStoreProxy:
    """Transparent proxy that starts with ChatStore and can be switched to Postgres."""

    def __init__(self) -> None:
        self._mod_log: list[ModerationAction] = []
        self._verified_users: set[str] = set()
        impl = ChatStore()
        # Share mutable containers so in-memory store uses the same data
        impl._mod_log = self._mod_log
        impl._verified_users = self._verified_users
        self._impl = impl

    def _switch_to_postgres(self, pg) -> None:
        self._impl = pg

    # Synchronous methods that always stay in-memory

    def mark_user_verified(self, user_id: str, *, verified: bool = True) -> None:
        if verified:
            self._verified_users.add(user_id)
        else:
            self._verified_users.discard(user_id)

    def is_user_verified(self, user_id: str) -> bool:
        return user_id in self._verified_users

    def log_mod(self, action: ModerationAction) -> None:
        self._mod_log.append(action)
        if len(self._mod_log) > 5000:
            del self._mod_log[:-3000]

    def mod_log(self, conv_id: str, limit: int = 50) -> list[ModerationAction]:
        items = [a for a in self._mod_log if a.conversation_id == conv_id]
        return list(reversed(items[-limit:]))

    def __getattr__(self, name: str):
        return getattr(self._impl, name)


def _default_title(space_type: str, member_ids: list[str]) -> str:
    if space_type == "dm" and member_ids:
        return f"Chat with {member_ids[0][:6]}"
    labels = {
        "private_group": "Private Group",
        "public_group": "Public Group",
        "channel": "Channel",
        "broadcast": "Broadcast",
        "community": "Community",
        "supergroup": "Supergroup",
    }
    return labels.get(space_type, "Group")


chat_store = _ChatStoreProxy()
