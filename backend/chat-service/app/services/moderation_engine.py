"""Anti-spam, slow mode, and auto-moderation."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

_SPAM_KEYWORDS = frozenset(
    {
        "free money",
        "click here",
        "crypto giveaway",
        "dm me",
        "whatsapp",
        "telegram.me/join",
    }
)
_URL_RE = re.compile(r"https?://|www\.", re.I)


@dataclass
class ModVerdict:
    allowed: bool
    code: str | None = None
    message: str | None = None
    auto_flagged: bool = False


@dataclass
class ModerationEngine:
    """Per-conversation send tracking (in-memory; use Redis in production)."""

    _last_send: dict[tuple[str, str], datetime] = field(default_factory=dict)
    _recent_bodies: dict[tuple[str, str], list[str]] = field(default_factory=dict)
    _send_counts: dict[tuple[str, str], list[datetime]] = field(default_factory=dict)

    def check_send(
        self,
        *,
        conversation_id: str,
        user_id: str,
        body: str,
        slow_mode_seconds: int,
        anti_spam_enabled: bool,
        auto_mod_level: int,
        muted_until: datetime | None,
        is_banned: bool,
    ) -> ModVerdict:
        if is_banned:
            return ModVerdict(False, "BANNED", "You are banned from this space")
        if muted_until and datetime.now(UTC) < muted_until:
            return ModVerdict(False, "MUTED", "You are muted in this space")

        key = (conversation_id, user_id)
        now = datetime.now(UTC)

        if slow_mode_seconds > 0:
            last = self._last_send.get(key)
            if last and (now - last).total_seconds() < slow_mode_seconds:
                wait = int(slow_mode_seconds - (now - last).total_seconds())
                return ModVerdict(
                    False,
                    "SLOW_MODE",
                    f"Slow mode: wait {max(1, wait)}s before sending again",
                )

        if anti_spam_enabled:
            bucket = self._send_counts.setdefault(key, [])
            bucket[:] = [t for t in bucket if (now - t).total_seconds() < 60]
            if len(bucket) >= 20:
                return ModVerdict(False, "RATE_LIMITED", "Too many messages. Try again later.")
            bucket.append(now)

            recent = self._recent_bodies.setdefault(key, [])
            norm = body.strip().lower()[:500]
            if norm and norm in recent[-5:]:
                return ModVerdict(False, "DUPLICATE", "Duplicate message blocked")
            recent.append(norm)
            if len(recent) > 10:
                del recent[:-10]

        if auto_mod_level > 0:
            verdict = self._auto_mod(body, level=auto_mod_level)
            if not verdict.allowed:
                return verdict

        self._last_send[key] = now
        return ModVerdict(True)

    def _auto_mod(self, body: str, *, level: int) -> ModVerdict:
        lower = body.lower()
        for kw in _SPAM_KEYWORDS:
            if kw in lower:
                return ModVerdict(
                    False,
                    "AUTO_MOD_BLOCKED",
                    "Message blocked by auto-moderation",
                    auto_flagged=True,
                )
        if level >= 2:
            urls = len(_URL_RE.findall(body))
            if urls >= 3:
                return ModVerdict(
                    False,
                    "AUTO_MOD_LINK_FLOOD",
                    "Too many links in one message",
                    auto_flagged=True,
                )
            if len(body) > 20 and sum(1 for c in body if c.isupper()) / len(body) > 0.7:
                return ModVerdict(
                    False,
                    "AUTO_MOD_CAPS",
                    "Excessive caps blocked",
                    auto_flagged=True,
                )
        return ModVerdict(True)


moderation_engine = ModerationEngine()
