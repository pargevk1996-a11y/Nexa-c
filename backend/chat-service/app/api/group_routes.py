from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user_id
from app.schemas.groups import (
    BanRequest,
    CreateSpaceRequest,
    InviteRequest,
    MemberResponse,
    ModerationLogEntry,
    MuteRequest,
    PublicSpaceResponse,
    SetRoleRequest,
    SpaceDetailResponse,
    SpaceSettingsSchema,
    UpdateSpaceSettingsRequest,
    VerifyUserRequest,
)
from app.services.chat_store import SpaceSettings, chat_store
from app.services.group_service import group_service
from app.services.realtime_publisher import publish_message_event

router = APIRouter(prefix="/api/v1/spaces", tags=["spaces"])


def _settings_schema(s: SpaceSettings) -> SpaceSettingsSchema:
    return SpaceSettingsSchema(
        slow_mode_seconds=s.slow_mode_seconds,
        anti_spam_enabled=s.anti_spam_enabled,
        auto_mod_level=s.auto_mod_level,
        join_requires_verification=s.join_requires_verification,
        comments_enabled=s.comments_enabled,
        invite_only=s.invite_only,
    )


async def _space_detail(c, user_id: str) -> SpaceDetailResponse:
    role = group_service.get_member_role(c, user_id)
    channels = (
        [ch.id for ch in await chat_store.list_channels_in_community(c.id)] if c.type == "community" else []
    )
    return SpaceDetailResponse(
        id=c.id,
        type=c.type,
        title=c.title,
        description=c.description,
        slug=c.slug,
        is_public=c.is_public,
        verified=c.verified,
        parent_id=c.parent_id,
        member_count=len(c.members),
        settings=_settings_schema(c.settings),
        pinned_message_ids=list(c.pinned_message_ids),
        my_role=role,
        channel_ids=channels,
    )


def _public_space(c) -> PublicSpaceResponse:
    return PublicSpaceResponse(
        id=c.id,
        type=c.type,
        title=c.title,
        description=c.description,
        slug=c.slug,
        verified=c.verified,
        member_count=len(c.members),
    )


@router.get("/discover", response_model=list[PublicSpaceResponse])
async def discover_spaces(
    type: str | None = None,
    limit: int = Query(default=50, le=100),
    _user_id: str = Depends(get_current_user_id),
) -> list[PublicSpaceResponse]:
    return [_public_space(c) for c in await chat_store.list_public(space_type=type, limit=limit)]


@router.get("/by-slug/{slug}", response_model=SpaceDetailResponse)
async def get_by_slug(slug: str, user_id: str = Depends(get_current_user_id)) -> SpaceDetailResponse:
    c = await chat_store.get_by_slug(slug)
    if not c:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Space not found"}})
    return await _space_detail(c, user_id)


@router.post("", response_model=SpaceDetailResponse, status_code=201)
async def create_space(
    body: CreateSpaceRequest,
    user_id: str = Depends(get_current_user_id),
) -> SpaceDetailResponse:
    settings = None
    if body.settings:
        settings = SpaceSettings(**body.settings.model_dump())
    try:
        c = await chat_store.create_conversation(
            user_id,
            type=body.type,
            title=body.title,
            member_ids=body.member_ids,
            is_public=body.is_public,
            description=body.description,
            slug=body.slug,
            parent_id=body.parent_id,
            verified=body.verified,
            settings=settings,
        )
    except ValueError as e:
        code = str(e)
        if code == "SLUG_TAKEN":
            raise HTTPException(
                status_code=409,
                detail={"error": {"code": "SLUG_TAKEN", "message": "Slug already in use"}},
            ) from e
        if code == "INVALID_PARENT":
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "INVALID_PARENT", "message": "parent_id must be a community"}},
            ) from e
        raise
    return await _space_detail(c, user_id)


@router.get("/{space_id}", response_model=SpaceDetailResponse)
async def get_space(space_id: str, user_id: str = Depends(get_current_user_id)) -> SpaceDetailResponse:
    c = await chat_store.get_conversation(space_id, user_id)
    if not c:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Space not found"}})
    return await _space_detail(c, user_id)


@router.post("/{space_id}/join", response_model=SpaceDetailResponse)
async def join_space(space_id: str, user_id: str = Depends(get_current_user_id)) -> SpaceDetailResponse:
    try:
        c = await chat_store.join_public(space_id, user_id)
    except ValueError as e:
        _raise_join_error(e)
    return await _space_detail(c, user_id)


async def _clear_group_key_packages(conv_id: str) -> None:
    """Delete all Redis key packages for a conversation, forcing re-key on next send."""
    from app.core.redis import get_redis
    redis = await get_redis()
    pattern = f"kp:{conv_id}:*"
    cursor = 0
    while True:
        cursor, keys = await redis.scan(cursor, match=pattern, count=100)
        if keys:
            await redis.delete(*keys)
        if cursor == 0:
            break


@router.post("/{space_id}/leave")
async def leave_space(space_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    try:
        await chat_store.leave(space_id, user_id)
    except ValueError as e:
        if str(e) == "NOT_FOUND":
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}}) from e
        raise
    await _clear_group_key_packages(space_id)
    await publish_message_event(
        name="member.changed",
        conversation_id=space_id,
        payload={"conversation_id": space_id, "action": "left", "user_id": user_id},
    )
    return {"ok": True}


@router.post("/{space_id}/invite", response_model=list[MemberResponse])
async def invite_members(
    space_id: str,
    body: InviteRequest,
    user_id: str = Depends(get_current_user_id),
) -> list[MemberResponse]:
    conv = await chat_store.get_conversation_member(space_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    try:
        group_service.assert_can_manage_members(conv, user_id)
    except ValueError as e:
        if str(e) == "FORBIDDEN":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}}) from e
        raise
    new_ids = [
        uid
        for uid in body.user_ids
        if uid not in conv.banned_user_ids and not group_service.get_member_role(conv, uid)
    ]
    if new_ids:
        await chat_store.add_members(space_id, new_ids)
        conv = await chat_store.get_conversation_member(space_id, user_id)
        await _clear_group_key_packages(space_id)
        await publish_message_event(
            name="member.changed",
            conversation_id=space_id,
            payload={"conversation_id": space_id, "action": "joined", "user_ids": new_ids},
        )
    return [
        MemberResponse(
            user_id=m.user_id,
            role=m.role,
            is_verified=m.is_verified,
            joined_at=m.joined_at.isoformat(),
        )
        for m in conv.members
    ]


@router.get("/{space_id}/members", response_model=list[MemberResponse])
async def list_members(
    space_id: str,
    user_id: str = Depends(get_current_user_id),
) -> list[MemberResponse]:
    conv = await chat_store.get_conversation(space_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    return [
        MemberResponse(
            user_id=m.user_id,
            role=m.role,
            is_verified=m.is_verified,
            joined_at=m.joined_at.isoformat(),
        )
        for m in conv.members
    ]


@router.patch("/{space_id}/members/role", response_model=MemberResponse)
async def set_role(
    space_id: str,
    body: SetRoleRequest,
    user_id: str = Depends(get_current_user_id),
) -> MemberResponse:
    conv = await chat_store.get_conversation_member(space_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    try:
        group_service.assert_can_manage_members(conv, user_id)
        m = await chat_store.set_member_role(space_id, user_id, body.user_id, body.role)
    except ValueError as e:
        if str(e) == "FORBIDDEN":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}}) from e
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}}) from e
    return MemberResponse(
        user_id=m.user_id,
        role=m.role,
        is_verified=m.is_verified,
        joined_at=m.joined_at.isoformat(),
    )


@router.patch("/{space_id}/settings", response_model=SpaceDetailResponse)
async def update_settings(
    space_id: str,
    body: UpdateSpaceSettingsRequest,
    user_id: str = Depends(get_current_user_id),
) -> SpaceDetailResponse:
    conv = await chat_store.get_conversation_member(space_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    try:
        group_service.assert_can_manage_settings(conv, user_id)
    except ValueError as e:
        if str(e) == "FORBIDDEN":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}}) from e
        raise
    data = conv.settings
    patch = body.model_dump(exclude_unset=True)
    for k, v in patch.items():
        setattr(data, k, v)
    updated = await chat_store.update_settings(space_id, data)
    return await _space_detail(updated, user_id)


@router.post("/{space_id}/moderation/ban")
async def ban_user(
    space_id: str,
    body: BanRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    conv = await chat_store.get_conversation_member(space_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    try:
        group_service.assert_can_moderate(conv, user_id)
        await chat_store.ban_user(space_id, body.user_id)
        group_service.mod_action(
            conv_id=space_id,
            actor_id=user_id,
            action="ban",
            target_user_id=body.user_id,
            reason=body.reason,
        )
    except ValueError as e:
        if str(e) == "FORBIDDEN":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}}) from e
        raise
    await _clear_group_key_packages(space_id)
    await publish_message_event(
        name="member.changed",
        conversation_id=space_id,
        payload={"conversation_id": space_id, "action": "banned", "user_id": body.user_id},
    )
    return {"ok": True}


@router.post("/{space_id}/moderation/unban")
async def unban_user(
    space_id: str,
    body: BanRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    conv = await chat_store.get_conversation_member(space_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    try:
        group_service.assert_can_moderate(conv, user_id)
        await chat_store.unban_user(space_id, body.user_id)
        group_service.mod_action(
            conv_id=space_id,
            actor_id=user_id,
            action="unban",
            target_user_id=body.user_id,
        )
    except ValueError as e:
        if str(e) == "FORBIDDEN":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}}) from e
        raise
    return {"ok": True}


@router.post("/{space_id}/moderation/mute")
async def mute_user(
    space_id: str,
    body: MuteRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    conv = await chat_store.get_conversation_member(space_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    try:
        group_service.assert_can_moderate(conv, user_id)
        until = await group_service.mute_for_minutes(space_id, body.user_id, body.minutes)
        group_service.mod_action(
            conv_id=space_id,
            actor_id=user_id,
            action="mute",
            target_user_id=body.user_id,
            reason=f"{body.minutes}m",
        )
    except ValueError as e:
        if str(e) == "FORBIDDEN":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}}) from e
        raise
    return {"ok": True, "muted_until": until.isoformat()}


@router.post("/{space_id}/moderation/unmute")
async def unmute_user(
    space_id: str,
    body: BanRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    conv = await chat_store.get_conversation_member(space_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    try:
        group_service.assert_can_moderate(conv, user_id)
        await chat_store.unmute_user(space_id, body.user_id)
        group_service.mod_action(
            conv_id=space_id,
            actor_id=user_id,
            action="unmute",
            target_user_id=body.user_id,
        )
    except ValueError as e:
        if str(e) == "FORBIDDEN":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}}) from e
        raise
    return {"ok": True}


@router.get("/{space_id}/moderation/log", response_model=list[ModerationLogEntry])
async def moderation_log(
    space_id: str,
    user_id: str = Depends(get_current_user_id),
) -> list[ModerationLogEntry]:
    conv = await chat_store.get_conversation_member(space_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    try:
        group_service.assert_can_moderate(conv, user_id)
    except ValueError as e:
        if str(e) == "FORBIDDEN":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}}) from e
        raise
    return [
        ModerationLogEntry(
            id=a.id,
            action=a.action,
            actor_id=a.actor_id,
            target_user_id=a.target_user_id,
            target_message_id=a.target_message_id,
            reason=a.reason,
            created_at=a.created_at.isoformat(),
        )
        for a in chat_store.mod_log(space_id)
    ]


@router.post("/verification/users/{target_user_id}")
async def verify_user(
    target_user_id: str,
    body: VerifyUserRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Platform verification badge (admin stub — any member can verify in dev)."""
    chat_store.mark_user_verified(target_user_id, verified=body.verified)
    return {"user_id": target_user_id, "verified": body.verified}


def _raise_join_error(e: ValueError) -> None:
    code = str(e)
    mapping = {
        "NOT_FOUND": (404, "NOT_FOUND", "Space not found or not public"),
        "BANNED": (403, "BANNED", "You are banned"),
        "VERIFICATION_REQUIRED": (403, "VERIFICATION_REQUIRED", "Verified account required"),
        "INVITE_ONLY": (403, "INVITE_ONLY", "This space is invite-only"),
    }
    if code in mapping:
        status, err_code, msg = mapping[code]
        raise HTTPException(status_code=status, detail={"error": {"code": err_code, "message": msg}}) from e
    raise
