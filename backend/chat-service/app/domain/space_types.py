"""Space kinds: groups, channels, communities, broadcast."""

from __future__ import annotations

SPACE_TYPES = frozenset(
    {
        "dm",
        "private_group",
        "public_group",
        "group",  # alias → public_group when is_public else private_group
        "channel",
        "broadcast",
        "community",
        "supergroup",
    }
)

BROADCAST_TYPES = frozenset({"channel", "broadcast"})
GROUP_TYPES = frozenset({"private_group", "public_group", "group", "supergroup"})
THREAD_CAPABLE = frozenset(
    {
        "private_group",
        "public_group",
        "group",
        "supergroup",
        "channel",
        "community",
    }
)


def normalize_type(raw: str, *, is_public: bool) -> str:
    if raw == "group":
        return "public_group" if is_public else "private_group"
    return raw


def can_have_threads(space_type: str) -> bool:
    return space_type in THREAD_CAPABLE
