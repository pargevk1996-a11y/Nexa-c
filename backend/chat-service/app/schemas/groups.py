from pydantic import BaseModel, Field

from app.domain.space_types import SPACE_TYPES


class SpaceSettingsSchema(BaseModel):
    slow_mode_seconds: int = Field(default=0, ge=0, le=3600)
    anti_spam_enabled: bool = True
    auto_mod_level: int = Field(default=1, ge=0, le=2)
    join_requires_verification: bool = False
    comments_enabled: bool = True
    invite_only: bool = False


class CreateSpaceRequest(BaseModel):
    type: str = Field(description=f"One of: {', '.join(sorted(SPACE_TYPES))}")
    title: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=2000)
    slug: str | None = Field(default=None, min_length=3, max_length=64, pattern=r"^[a-z0-9_-]+$")
    member_ids: list[str] = Field(default_factory=list)
    is_public: bool = False
    parent_id: str | None = None
    verified: bool = False
    settings: SpaceSettingsSchema | None = None


class UpdateSpaceSettingsRequest(BaseModel):
    slow_mode_seconds: int | None = Field(default=None, ge=0, le=3600)
    anti_spam_enabled: bool | None = None
    auto_mod_level: int | None = Field(default=None, ge=0, le=2)
    join_requires_verification: bool | None = None
    comments_enabled: bool | None = None
    invite_only: bool | None = None


class SpaceDetailResponse(BaseModel):
    id: str
    type: str
    title: str | None
    description: str | None = None
    slug: str | None = None
    is_public: bool
    verified: bool = False
    parent_id: str | None = None
    member_count: int
    settings: SpaceSettingsSchema
    pinned_message_ids: list[str] = Field(default_factory=list)
    my_role: str | None = None
    channel_ids: list[str] = Field(default_factory=list)


class PublicSpaceResponse(BaseModel):
    id: str
    type: str
    title: str | None
    description: str | None = None
    slug: str | None = None
    verified: bool
    member_count: int


class MemberResponse(BaseModel):
    user_id: str
    role: str
    is_verified: bool
    joined_at: str


class SetRoleRequest(BaseModel):
    user_id: str
    role: str = Field(pattern="^(admin|moderator|member)$")


class InviteRequest(BaseModel):
    user_ids: list[str] = Field(min_length=1)


class MuteRequest(BaseModel):
    user_id: str
    minutes: int = Field(default=60, ge=1, le=10080)


class BanRequest(BaseModel):
    user_id: str
    reason: str | None = Field(default=None, max_length=500)


class ModerationLogEntry(BaseModel):
    id: str
    action: str
    actor_id: str
    target_user_id: str | None
    target_message_id: str | None
    reason: str | None
    created_at: str


class VerifyUserRequest(BaseModel):
    verified: bool = True
