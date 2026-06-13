"""Dispatch notifications to platform channels (WebPush / FCM / APNs stubs + outbox)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.schemas.notifications import DispatchNotificationRequest, DispatchNotificationResponse
from app.services.grouping import build_grouped_payload
from app.services.mute_engine import DispatchContext, MuteContext, channels_for, should_notify
from app.services.notification_store import notification_store

logger = logging.getLogger(__name__)


@dataclass
class DispatchStats:
    queued: int = 0
    suppressed: int = 0
    grouped: int = 0


def _mute_ctx(user_id: str, conversation_id: str) -> MuteContext:
    global_pref = notification_store.get_preferences(user_id, None)
    conv_pref = notification_store.get_preferences(user_id, conversation_id)
    return MuteContext(
        mute_until=conv_pref.mute_until or global_pref.mute_until,
        mute_all=conv_pref.mute_all or global_pref.mute_all,
        mentions_only=conv_pref.mentions_only or global_pref.mentions_only,
        quiet_hours_enabled=conv_pref.quiet_hours_enabled or global_pref.quiet_hours_enabled,
        quiet_hours_start=conv_pref.quiet_hours_start or global_pref.quiet_hours_start,
        quiet_hours_end=conv_pref.quiet_hours_end or global_pref.quiet_hours_end,
        push_enabled=conv_pref.push_enabled and global_pref.push_enabled,
        desktop_enabled=conv_pref.desktop_enabled and global_pref.desktop_enabled,
        mobile_enabled=conv_pref.mobile_enabled and global_pref.mobile_enabled,
    )


async def dispatch_message_notifications(body: DispatchNotificationRequest) -> DispatchNotificationResponse:
    stats = DispatchStats()
    for uid in body.target_user_ids:
        if uid == body.sender_id:
            continue
        ctx = _mute_ctx(uid, body.conversation_id)
        dispatch = DispatchContext(
            silent=body.silent,
            mention_user_ids=body.mention_user_ids,
            recipient_id=uid,
        )
        allow, reason = should_notify(ctx, dispatch)
        if not allow and reason != "silent_message":
            stats.suppressed += 1
            continue

        pref = notification_store.get_preferences(uid, body.conversation_id)
        is_silent = body.silent or reason == "silent_message"
        chans = channels_for(ctx, is_silent=is_silent)

        if pref.group_notifications:
            group = notification_store.bump_notification_group(
                uid,
                body.conversation_id,
                sender_name=body.sender_name,
                body_preview=body.body_preview,
                silent=is_silent,
            )
            payload = build_grouped_payload(
                state=group,
                conversation_title=body.conversation_title,
                preview=pref.preview,
            )
            stats.grouped += 1
            collapse = group.collapse_key
            count = group.message_count
        else:
            payload = {
                "title": body.conversation_title or body.sender_name,
                "body": body.body_preview[:180] if pref.preview else "New message",
                "tag": f"nexa:conv:{body.conversation_id}",
                "collapse_key": f"nexa:conv:{body.conversation_id}",
                "conversation_id": body.conversation_id,
                "message_id": body.message_id,
                "silent": is_silent,
                "group_count": 1,
            }
            collapse = payload["collapse_key"]
            count = 1

        subs = notification_store.list_subscriptions(uid)
        platforms = {s.platform for s in subs} if subs else {"web"}

        for platform in platforms:
            if platform == "fcm" and "mobile" not in chans and "push" not in chans:
                continue
            if platform == "apns" and "mobile" not in chans:
                continue
            if platform in ("web", "desktop") and "desktop" not in chans and "push" not in chans:
                if is_silent and "push" in chans:
                    pass
                elif not is_silent:
                    continue

            row = notification_store.enqueue(
                uid,
                platform,
                collapse_key=collapse,
                group_count=count,
                payload={**payload, "platform": platform, "sound": pref.sound and not is_silent},
                silent=is_silent,
            )
            stats.queued += 1
            await _deliver_stub(platform, row.payload)

    return DispatchNotificationResponse(
        queued=stats.queued,
        suppressed=stats.suppressed,
        grouped=stats.grouped,
    )


async def _deliver_stub(platform: str, payload: dict) -> None:
    """Replace with pywebpush / FCM / APNs in production."""
    logger.debug("notify [%s] %s", platform, payload.get("title"))


async def dispatch_contact_request_notification(
    *,
    to_user_id: str,
    from_user_id: str,
    from_username: str,
    request_id: str,
) -> None:
    """Store and deliver a contact request notification."""
    subs = notification_store.list_subscriptions(to_user_id)
    payload = {
        "type": "contact_request",
        "title": "New contact request",
        "body": f"@{from_username} wants to connect with you",
        "from_user_id": from_user_id,
        "request_id": request_id,
    }
    for sub in subs:
        notification_store.enqueue(
            to_user_id,
            sub.platform,
            collapse_key=f"contact_request:{request_id}",
            group_count=1,
            payload=payload,
            silent=False,
        )
        await _deliver_stub(sub.platform, payload)
