"""Notification grouping — collapse per conversation for push payloads."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass
class GroupState:
    user_id: str
    conversation_id: str
    collapse_key: str
    message_count: int
    latest_title: str
    latest_body: str
    silent: bool
    updated_at: datetime


def collapse_key(conversation_id: str) -> str:
    return f"nexa:conv:{conversation_id}"


def build_grouped_payload(
    *,
    state: GroupState,
    conversation_title: str | None,
    preview: bool,
) -> dict:
    title = conversation_title or state.latest_title
    if state.message_count > 1:
        title = f"{title} ({state.message_count} new)"
    body = state.latest_body[:180] if preview else "New message"
    return {
        "title": title,
        "body": body,
        "tag": state.collapse_key,
        "collapse_key": state.collapse_key,
        "group": state.collapse_key,
        "group_count": state.message_count,
        "conversation_id": state.conversation_id,
        "silent": state.silent,
        "renotify": True,
    }


def bump_group(
    existing: GroupState | None,
    *,
    user_id: str,
    conversation_id: str,
    sender_name: str,
    body_preview: str,
    silent: bool,
) -> GroupState:
    now = datetime.now(UTC)
    key = collapse_key(conversation_id)
    if existing is None:
        return GroupState(
            user_id=user_id,
            conversation_id=conversation_id,
            collapse_key=key,
            message_count=1,
            latest_title=sender_name,
            latest_body=body_preview,
            silent=silent,
            updated_at=now,
        )
    existing.message_count += 1
    existing.latest_body = body_preview
    existing.latest_title = sender_name
    existing.silent = existing.silent and silent
    existing.updated_at = now
    return existing
