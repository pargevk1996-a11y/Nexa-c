"""In-memory notification store (Postgres schema in infrastructure/postgres/migrations/notification_db/)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, time
from uuid import uuid4

from app.services.grouping import GroupState, bump_group


@dataclass
class NotificationPreferences:
    user_id: str
    conversation_id: str | None = None
    mute_until: datetime | None = None
    mute_all: bool = False
    mentions_only: bool = False
    push_enabled: bool = True
    desktop_enabled: bool = True
    mobile_enabled: bool = True
    preview: bool = True
    sound: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    group_notifications: bool = True


@dataclass
class PushSubscription:
    id: str
    user_id: str
    platform: str
    endpoint: str
    keys: dict | None
    device_name: str | None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class OutboxRow:
    id: int
    user_id: str
    platform: str
    collapse_key: str | None
    group_count: int
    payload: dict
    silent: bool
    status: str
    created_at: datetime


class NotificationStore:
    def __init__(self) -> None:
        self._prefs: dict[tuple[str, str | None], NotificationPreferences] = {}
        self._subs: dict[str, PushSubscription] = {}
        self._groups: dict[tuple[str, str], GroupState] = {}
        self._outbox: list[OutboxRow] = []
        self._outbox_seq = 0

    def _pref_key(self, user_id: str, conversation_id: str | None) -> tuple[str, str | None]:
        return (user_id, conversation_id)

    def get_preferences(self, user_id: str, conversation_id: str | None = None) -> NotificationPreferences:
        key = self._pref_key(user_id, conversation_id)
        if key not in self._prefs:
            global_key = self._pref_key(user_id, None)
            base = self._prefs.get(global_key)
            self._prefs[key] = NotificationPreferences(
                user_id=user_id,
                conversation_id=conversation_id,
                mute_until=base.mute_until if base else None,
                mute_all=base.mute_all if base else False,
                mentions_only=base.mentions_only if base else False,
                push_enabled=base.push_enabled if base else True,
                desktop_enabled=base.desktop_enabled if base else True,
                mobile_enabled=base.mobile_enabled if base else True,
                preview=base.preview if base else True,
                sound=base.sound if base else True,
                quiet_hours_enabled=base.quiet_hours_enabled if base else False,
                quiet_hours_start=base.quiet_hours_start if base else None,
                quiet_hours_end=base.quiet_hours_end if base else None,
                group_notifications=base.group_notifications if base else True,
            )
        return self._prefs[key]

    def upsert_preferences(
        self,
        user_id: str,
        conversation_id: str | None,
        **fields: object,
    ) -> NotificationPreferences:
        pref = self.get_preferences(user_id, conversation_id)
        for k, v in fields.items():
            if hasattr(pref, k) and v is not None:
                setattr(pref, k, v)
        self._prefs[self._pref_key(user_id, conversation_id)] = pref
        return pref

    def list_subscriptions(self, user_id: str) -> list[PushSubscription]:
        return [s for s in self._subs.values() if s.user_id == user_id]

    def add_subscription(
        self,
        user_id: str,
        *,
        platform: str,
        endpoint: str,
        keys: dict | None,
        device_name: str | None,
    ) -> PushSubscription:
        for s in self._subs.values():
            if s.user_id == user_id and s.endpoint == endpoint:
                return s
        sub = PushSubscription(
            id=str(uuid4()),
            user_id=user_id,
            platform=platform,
            endpoint=endpoint,
            keys=keys,
            device_name=device_name,
        )
        self._subs[sub.id] = sub
        return sub

    def remove_subscription(self, user_id: str, sub_id: str) -> bool:
        sub = self._subs.get(sub_id)
        if not sub or sub.user_id != user_id:
            return False
        del self._subs[sub_id]
        return True

    def bump_notification_group(
        self,
        user_id: str,
        conversation_id: str,
        *,
        sender_name: str,
        body_preview: str,
        silent: bool,
    ) -> GroupState:
        gkey = (user_id, conversation_id)
        state = bump_group(
            self._groups.get(gkey),
            user_id=user_id,
            conversation_id=conversation_id,
            sender_name=sender_name,
            body_preview=body_preview,
            silent=silent,
        )
        self._groups[gkey] = state
        return state

    def enqueue(
        self,
        user_id: str,
        platform: str,
        *,
        collapse_key: str | None,
        group_count: int,
        payload: dict,
        silent: bool,
    ) -> OutboxRow:
        self._outbox_seq += 1
        row = OutboxRow(
            id=self._outbox_seq,
            user_id=user_id,
            platform=platform,
            collapse_key=collapse_key,
            group_count=group_count,
            payload=payload,
            silent=silent,
            status="pending",
            created_at=datetime.now(UTC),
        )
        self._outbox.append(row)
        if len(self._outbox) > 10_000:
            self._outbox = self._outbox[-5000:]
        return row

    def pending_outbox(self, user_id: str | None = None, limit: int = 50) -> list[OutboxRow]:
        rows = [r for r in self._outbox if r.status == "pending"]
        if user_id:
            rows = [r for r in rows if r.user_id == user_id]
        return rows[-limit:]


notification_store = NotificationStore()
