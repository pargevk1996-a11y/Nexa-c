from pydantic import BaseModel, Field


class BlockUserRequest(BaseModel):
    user_id: str = Field(min_length=1)
    reason: str | None = None


class BlockedUserResponse(BaseModel):
    user_id: str
    display_name: str | None = None
    blocked_at: str
    reason: str | None = None


class SendContactRequestBody(BaseModel):
    to_user_id: str = Field(min_length=1)
    from_username: str = ""


class ContactRequestResponse(BaseModel):
    id: str
    from_user_id: str
    to_user_id: str
    status: str
    conversation_id: str | None = None
    created_at: str
    resolved_at: str | None = None


class ContactStatusResponse(BaseModel):
    status: str  # "none" | "pending_sent" | "pending_received" | "contacts"
    request_id: str | None = None
    conversation_id: str | None = None
