from pydantic import BaseModel, Field


class ConversationResponse(BaseModel):
    id: str
    type: str
    title: str | None = None
    description: str | None = None
    slug: str | None = None
    is_public: bool = False
    verified: bool = False
    parent_id: str | None = None
    member_count: int = 0
    last_message_preview: str | None = None
    unread_count: int = 0
    pinned_message_ids: list[str] = Field(default_factory=list)
    my_role: str | None = None
    peer_user_id: str | None = None
    member_ids: list[str] = Field(default_factory=list)
    is_locked: bool = False


class CreateConversationRequest(BaseModel):
    type: str = Field(
        pattern="^(dm|group|private_group|public_group|channel|broadcast|community|supergroup)$"
    )
    title: str | None = None
    description: str | None = None
    slug: str | None = None
    member_ids: list[str] = Field(default_factory=list)
    is_public: bool = False
    parent_id: str | None = None
    verified: bool = False
    locked_for: str | None = None


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    seq: int
    body: str
    content_type: str = "text"
    reply_to_id: str | None = None
    thread_root_id: str | None = None
    thread_reply_count: int = 0
    forward_from_id: str | None = None
    forward_blocked: bool = False
    media_id: str | None = None
    e2ee_envelope: dict | None = None
    expires_at: str | None = None
    edited_at: str | None = None
    deleted_for_everyone_at: str | None = None
    silent: bool = False
    reactions: dict[str, list[str]] = Field(default_factory=dict)
    created_at: str
    delivered_to: list[str] = Field(default_factory=list)
    read_by: list[str] = Field(default_factory=list)


class SendMessageRequest(BaseModel):
    client_msg_id: str = Field(min_length=8, max_length=64)
    body: str = Field(min_length=1, max_length=16000)
    content_type: str = "text"
    reply_to_id: str | None = None
    thread_root_id: str | None = None
    forward_from_id: str | None = None
    forward_blocked: bool = False
    media_id: str | None = None
    expires_at: str | None = None
    e2ee_envelope: dict | None = None
    silent: bool = False


class EditMessageRequest(BaseModel):
    body: str = Field(min_length=1, max_length=16000)


class ReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)


class ReadReceiptRequest(BaseModel):
    up_to_seq: int


class PinRequest(BaseModel):
    message_id: str
    pinned: bool = True
