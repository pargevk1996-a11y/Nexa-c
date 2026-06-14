"""Group/channel business rules: permissions + moderation gates."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.domain.permissions import (
    can_delete_any_message,
    can_manage_members,
    can_manage_settings,
    can_moderate,
    can_pin,
    can_post_broadcast,
    can_post_in_community_main,
)
from app.domain.space_types import BROADCAST_TYPES
from app.services.chat_store import (
    Conversation,
    Message,
    ModerationAction,
    chat_store,
)
from app.services.moderation_engine import ModVerdict, moderation_engine


class GroupService:
    def __init__(self, store) -> None:
        self._store = store

    def get_member_role(self, conv: Conversation, user_id: str) -> str | None:
        for m in conv.members:
            if m.user_id == user_id:
                return m.role
        return None

    def assert_can_send(
        self,
        conv: Conversation,
        user_id: str,
        body: str,
        *,
        thread_root_id: str | None,
    ) -> ModVerdict:
        role = self.get_member_role(conv, user_id)
        if not role:
            raise ValueError("NOT_MEMBER")

        muted_until = conv.muted_until.get(user_id)
        verdict = moderation_engine.check_send(
            conversation_id=conv.id,
            user_id=user_id,
            body=body,
            slow_mode_seconds=conv.settings.slow_mode_seconds,
            anti_spam_enabled=conv.settings.anti_spam_enabled,
            auto_mod_level=conv.settings.auto_mod_level,
            muted_until=muted_until,
            is_banned=user_id in conv.banned_user_ids,
        )
        if not verdict.allowed:
            return verdict

        in_thread = thread_root_id is not None
        if conv.type in BROADCAST_TYPES and not in_thread:
            if not can_post_broadcast(conv.type, role):
                return ModVerdict(False, "BROADCAST_ONLY", "Only admins can post to this channel")
            return verdict

        if not in_thread and not can_post_in_community_main(conv.type, role):
            return ModVerdict(
                False,
                "COMMUNITY_READONLY",
                "Post in a channel thread; main community feed is admin-only",
            )

        if in_thread and conv.type in BROADCAST_TYPES and not conv.settings.comments_enabled:
            return ModVerdict(False, "COMMENTS_DISABLED", "Comments are disabled on this channel")

        return verdict

    def assert_can_moderate(self, conv: Conversation, actor_id: str) -> str:
        role = self.get_member_role(conv, actor_id)
        if not role or not can_moderate(role):
            raise ValueError("FORBIDDEN")
        return role

    def assert_can_manage_settings(self, conv: Conversation, actor_id: str) -> None:
        role = self.get_member_role(conv, actor_id)
        if not role or not can_manage_settings(role):
            raise ValueError("FORBIDDEN")

    def assert_can_manage_members(self, conv: Conversation, actor_id: str) -> None:
        role = self.get_member_role(conv, actor_id)
        if not role or not can_manage_members(role):
            raise ValueError("FORBIDDEN")

    def assert_can_pin(self, conv: Conversation, actor_id: str) -> None:
        role = self.get_member_role(conv, actor_id)
        if not role or not can_pin(role):
            raise ValueError("FORBIDDEN")

    def assert_can_delete(self, conv: Conversation, actor_id: str, message: Message) -> bool:
        role = self.get_member_role(conv, actor_id)
        if not role:
            return False
        if message.sender_id == actor_id:
            return True
        return can_delete_any_message(role)

    def mod_action(
        self,
        *,
        conv_id: str,
        actor_id: str,
        action: str,
        target_user_id: str | None = None,
        target_message_id: str | None = None,
        reason: str | None = None,
    ) -> ModerationAction:
        entry = ModerationAction(
            id=str(uuid4()),
            conversation_id=conv_id,
            actor_id=actor_id,
            action=action,
            target_user_id=target_user_id,
            target_message_id=target_message_id,
            reason=reason,
        )
        self._store.log_mod(entry)
        return entry

    async def mute_for_minutes(self, conv_id: str, target_id: str, minutes: int) -> datetime:
        until = datetime.now(UTC) + timedelta(minutes=minutes)
        await self._store.mute_user(conv_id, target_id, until=until)
        return until


group_service = GroupService(chat_store)
