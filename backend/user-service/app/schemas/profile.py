from typing import Literal

from pydantic import BaseModel, Field

VerificationBadge = Literal["none", "verified", "official", "bot"]
AvatarKind = Literal["initial", "image", "animated"]


class ProfilePrivacySettings(BaseModel):
    show_last_seen: bool = True
    show_online_status: bool = True
    show_bio: bool = True
    show_status_text: bool = True
    show_avatar: bool = True
    allow_search_by_username: bool = True


class ProfileResponse(BaseModel):
    id: str
    username: str
    nickname: str = ""
    uid: str
    bio: str = ""
    status_text: str = ""
    avatar_url: str | None = None
    animated_avatar_url: str | None = None
    avatar_kind: AvatarKind = "initial"
    is_online: bool = False
    last_seen_at: str | None = None
    verification_badge: VerificationBadge = "none"
    privacy: ProfilePrivacySettings = Field(default_factory=ProfilePrivacySettings)
    ecdh_public_key: str | None = None
    mlkem_public_key: str | None = None
    created_at: str | None = None


class ProfileUpdateRequest(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=64)
    nickname: str | None = Field(default=None, max_length=64)
    bio: str | None = Field(default=None, max_length=500)
    status_text: str | None = Field(default=None, max_length=140)
    avatar_url: str | None = Field(default=None, max_length=2048)
    animated_avatar_url: str | None = Field(default=None, max_length=2048)
    avatar_kind: AvatarKind | None = None
    privacy: ProfilePrivacySettings | None = None


class PublicProfileResponse(BaseModel):
    id: str
    username: str
    nickname: str = ""
    uid: str
    bio: str = ""
    status_text: str = ""
    avatar_url: str | None = None
    animated_avatar_url: str | None = None
    avatar_kind: AvatarKind = "initial"
    is_online: bool = False
    last_seen_at: str | None = None
    verification_badge: VerificationBadge = "none"
    ecdh_public_key: str | None = None
    mlkem_public_key: str | None = None


class PresenceUpdateRequest(BaseModel):
    is_online: bool
    status_text: str | None = None


class TypingRequest(BaseModel):
    conversation_id: str
    is_typing: bool


class ProfileBootstrapRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    nickname: str | None = Field(default=None, max_length=64)
