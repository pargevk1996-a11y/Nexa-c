"""Smart mute: time-boxed mute, quiet hours, mentions-only while muted."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, time


@dataclass
class MuteContext:
    mute_until: datetime | None
    mute_all: bool
    mentions_only: bool
    quiet_hours_enabled: bool
    quiet_hours_start: time | None
    quiet_hours_end: time | None
    push_enabled: bool
    desktop_enabled: bool
    mobile_enabled: bool


@dataclass
class DispatchContext:
    silent: bool
    mention_user_ids: list[str]
    recipient_id: str


def _in_quiet_hours(now: datetime, start: time | None, end: time | None) -> bool:
    if not start or not end:
        return False
    t = now.time()
    if start <= end:
        return start <= t < end
    return t >= start or t < end


def should_notify(ctx: MuteContext, dispatch: DispatchContext) -> tuple[bool, str]:
    """
    Returns (allow, reason).
    reason: ok | silent_message | muted | quiet_hours | mentions_only_skip
    """
    if dispatch.silent:
        return True, "silent_message"

    now = datetime.now(UTC)

    if ctx.mute_all:
        if ctx.mentions_only and dispatch.recipient_id in dispatch.mention_user_ids:
            pass
        else:
            return False, "muted"

    if ctx.mute_until and ctx.mute_until > now:
        if ctx.mentions_only and dispatch.recipient_id in dispatch.mention_user_ids:
            pass
        else:
            return False, "muted"

    if ctx.quiet_hours_enabled and _in_quiet_hours(now, ctx.quiet_hours_start, ctx.quiet_hours_end):
        if ctx.mentions_only and dispatch.recipient_id in dispatch.mention_user_ids:
            pass
        else:
            return False, "quiet_hours"

    if not ctx.push_enabled and not ctx.desktop_enabled and not ctx.mobile_enabled:
        return False, "channels_disabled"

    return True, "ok"


def channels_for(ctx: MuteContext, *, is_silent: bool) -> list[str]:
    ch: list[str] = []
    if ctx.push_enabled:
        ch.append("push")
    if ctx.desktop_enabled:
        ch.append("desktop")
    if ctx.mobile_enabled:
        ch.append("mobile")
    if is_silent:
        return ch
    return ch
