"""RBAC for groups, channels, and communities."""

from __future__ import annotations

ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_MODERATOR = "moderator"
ROLE_MEMBER = "member"

ROLE_RANK = {ROLE_OWNER: 4, ROLE_ADMIN: 3, ROLE_MODERATOR: 2, ROLE_MEMBER: 1}


def rank(role: str) -> int:
    return ROLE_RANK.get(role, 0)


def can_manage_members(role: str) -> bool:
    return rank(role) >= ROLE_RANK[ROLE_ADMIN]


def can_manage_settings(role: str) -> bool:
    return rank(role) >= ROLE_RANK[ROLE_ADMIN]


def can_moderate(role: str) -> bool:
    return rank(role) >= ROLE_RANK[ROLE_MODERATOR]


def can_delete_any_message(role: str) -> bool:
    return rank(role) >= ROLE_RANK[ROLE_MODERATOR]


def can_pin(role: str) -> bool:
    return rank(role) >= ROLE_RANK[ROLE_MODERATOR]


def can_post_broadcast(space_type: str, role: str) -> bool:
    """Channels/broadcasts: only staff post to main timeline."""
    if space_type not in ("channel", "broadcast"):
        return True
    return rank(role) >= ROLE_RANK[ROLE_MODERATOR]


def can_post_in_community_main(space_type: str, role: str) -> bool:
    if space_type != "community":
        return True
    return rank(role) >= ROLE_RANK[ROLE_MODERATOR]
