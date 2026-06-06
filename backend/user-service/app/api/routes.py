from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user_id
from app.schemas.profile import (
    PresenceUpdateRequest,
    ProfileBootstrapRequest,
    ProfilePrivacySettings,
    ProfileResponse,
    ProfileUpdateRequest,
    PublicProfileResponse,
    TypingRequest,
)
from app.services.profile_store import ProfilePrivacy, profile_store

router = APIRouter(prefix="/api/v1", tags=["users"])


def _privacy_to_schema(p: ProfilePrivacy) -> ProfilePrivacySettings:
    return ProfilePrivacySettings(
        show_last_seen=p.show_last_seen,
        show_online_status=p.show_online_status,
        show_bio=p.show_bio,
        show_status_text=p.show_status_text,
        show_avatar=p.show_avatar,
        allow_search_by_username=p.allow_search_by_username,
    )


def _to_profile(p) -> ProfileResponse:
    return ProfileResponse(
        id=p.id,
        username=p.username,
        nickname=p.nickname,
        uid=p.uid,
        bio=p.bio,
        status_text=p.status_text,
        avatar_url=p.avatar_url,
        animated_avatar_url=p.animated_avatar_url,
        avatar_kind=p.avatar_kind,
        is_online=p.is_online,
        last_seen_at=p.last_seen_at.isoformat() if p.last_seen_at else None,
        verification_badge=p.verification_badge,
        privacy=_privacy_to_schema(p.privacy),
    )


def _to_public(p, viewer_id: str) -> PublicProfileResponse:
    visible = profile_store.apply_privacy_for_viewer(p, viewer_id)
    return PublicProfileResponse(
        id=visible.id,
        username=visible.username,
        nickname=visible.nickname,
        uid=visible.uid,
        bio=visible.bio,
        status_text=visible.status_text,
        avatar_url=visible.avatar_url,
        animated_avatar_url=visible.animated_avatar_url,
        avatar_kind=visible.avatar_kind,
        is_online=visible.is_online,
        last_seen_at=visible.last_seen_at.isoformat() if visible.last_seen_at else None,
        verification_badge=visible.verification_badge,
    )


@router.post("/bootstrap", response_model=ProfileResponse)
async def bootstrap_profile(
    body: ProfileBootstrapRequest,
    user_id: str = Depends(get_current_user_id),
) -> ProfileResponse:
    p = await profile_store.bootstrap(user_id, body.username, nickname=body.nickname)
    return _to_profile(p)


@router.delete("/me/avatar", response_model=ProfileResponse)
async def clear_my_avatar(user_id: str = Depends(get_current_user_id)) -> ProfileResponse:
    p = await profile_store.clear_avatar(user_id)
    if not p:
        p = await profile_store.ensure_profile(user_id, f"user_{user_id[:8]}")
    return _to_profile(p)


@router.get("/by-username/{username}", response_model=PublicProfileResponse)
async def get_by_username(
    username: str,
    viewer: str = Depends(get_current_user_id),
) -> PublicProfileResponse:
    p = await profile_store.get_by_username(username)
    if not p:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "User not found"}})
    return _to_public(p, viewer)


@router.get("/me", response_model=ProfileResponse)
async def get_me(user_id: str = Depends(get_current_user_id)) -> ProfileResponse:
    p = await profile_store.get(user_id)
    if not p:
        p = await profile_store.ensure_profile(user_id, f"user_{user_id[:8]}")
    return _to_profile(p)


@router.patch("/me", response_model=ProfileResponse)
async def update_me(
    body: ProfileUpdateRequest,
    user_id: str = Depends(get_current_user_id),
) -> ProfileResponse:
    p = await profile_store.get(user_id) or await profile_store.ensure_profile(
        user_id, body.username or f"user_{user_id[:8]}"
    )
    privacy = None
    if body.privacy is not None:
        privacy = ProfilePrivacy(**body.privacy.model_dump())
    try:
        updated = await profile_store.update(
            user_id,
            username=body.username,
            nickname=body.nickname,
            bio=body.bio,
            status_text=body.status_text,
            avatar_url=body.avatar_url,
            animated_avatar_url=body.animated_avatar_url,
            avatar_kind=body.avatar_kind,
            privacy=privacy,
        )
    except ValueError as e:
        if str(e) == "USERNAME_TAKEN":
            raise HTTPException(
                status_code=409,
                detail={"error": {"code": "USERNAME_TAKEN", "message": "Username already taken"}},
            ) from e
        raise
    return _to_profile(updated or p)


@router.get("/search", response_model=list[PublicProfileResponse])
async def search_users(
    q: str = Query(min_length=1, max_length=64),
    user_id: str = Depends(get_current_user_id),
) -> list[PublicProfileResponse]:
    results = await profile_store.search(q)
    return [_to_public(p, user_id) for p in results]


@router.get("/{user_id}", response_model=PublicProfileResponse)
async def get_user(
    user_id: str,
    viewer: str = Depends(get_current_user_id),
) -> PublicProfileResponse:
    p = await profile_store.get(user_id)
    if not p:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "User not found"}})
    return _to_public(p, viewer)


@router.post("/presence", response_model=ProfileResponse)
async def update_presence(
    body: PresenceUpdateRequest,
    user_id: str = Depends(get_current_user_id),
) -> ProfileResponse:
    p = await profile_store.get(user_id) or await profile_store.ensure_profile(
        user_id, f"user_{user_id[:8]}"
    )
    updated = await profile_store.set_presence(user_id, is_online=body.is_online, status_text=body.status_text)
    return _to_profile(updated or p)


@router.post("/typing")
async def set_typing(
    body: TypingRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    profile_store.set_typing(user_id, body.conversation_id, body.is_typing)
    return {"ok": True}


@router.get("/typing/{conversation_id}")
async def get_typing(
    conversation_id: str,
    _user_id: str = Depends(get_current_user_id),
) -> dict:
    return {"user_ids": profile_store.get_typing(conversation_id)}
