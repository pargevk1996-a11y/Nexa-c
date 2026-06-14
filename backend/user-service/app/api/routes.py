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
from app.services.screen_lock_store import screen_lock_store
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1", tags=["users"])


class ScreenLockState(BaseModel):
    locked: bool


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
    # Require a real username — never mint a `user_xxxx` placeholder. This closes
    # the last path that could create junk profiles from a stale/empty session.
    clean = (body.username or "").strip().lstrip("$")
    if not clean:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "USERNAME_REQUIRED", "message": "Username is required"}},
        )
    p = await profile_store.bootstrap(user_id, clean, nickname=body.nickname)
    return _to_profile(p)


@router.delete("/me/avatar", response_model=ProfileResponse)
async def clear_my_avatar(user_id: str = Depends(get_current_user_id)) -> ProfileResponse:
    p = await profile_store.clear_avatar(user_id)
    if not p:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "PROFILE_NOT_FOUND", "message": "Profile not bootstrapped"}},
        )
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
        # Do NOT auto-create a placeholder `user_xxxx` profile here. A valid JWT
        # without a profile (e.g. a stale token from a deleted account) would
        # otherwise spawn junk duplicate profiles. Return 404 so the client runs
        # the proper bootstrap flow with the real chosen username instead.
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "PROFILE_NOT_FOUND", "message": "Profile not bootstrapped"}},
        )
    return _to_profile(p)


@router.patch("/me", response_model=ProfileResponse)
async def update_me(
    body: ProfileUpdateRequest,
    user_id: str = Depends(get_current_user_id),
) -> ProfileResponse:
    p = await profile_store.get(user_id)
    if not p:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "PROFILE_NOT_FOUND", "message": "Profile not bootstrapped"}},
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


@router.get("/me/screen-lock", response_model=ScreenLockState)
async def get_screen_lock(user_id: str = Depends(get_current_user_id)) -> ScreenLockState:
    """Account-wide manual screen-lock flag. Read on app load so any device that
    opens the account reflects a lock set on another device."""
    return ScreenLockState(locked=await screen_lock_store.get(user_id))


@router.put("/me/screen-lock", response_model=ScreenLockState)
async def set_screen_lock(
    body: ScreenLockState,
    user_id: str = Depends(get_current_user_id),
) -> ScreenLockState:
    """Set/clear the account-wide screen lock. Only the lock STATE is stored —
    never the PIN itself (the PIN lives in the client's secure signature store)."""
    await screen_lock_store.set(user_id, body.locked)
    return ScreenLockState(locked=body.locked)


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
    p = await profile_store.get(user_id)
    if not p:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "PROFILE_NOT_FOUND", "message": "Profile not bootstrapped"}},
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
