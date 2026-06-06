from pydantic import BaseModel, Field


class BlockUserRequest(BaseModel):
    user_id: str = Field(min_length=1)
    reason: str | None = None


class BlockedUserResponse(BaseModel):
    user_id: str
    display_name: str | None = None
    blocked_at: str
    reason: str | None = None
