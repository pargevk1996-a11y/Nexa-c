from pydantic import BaseModel, Field


class IceServer(BaseModel):
    urls: list[str] | str
    username: str | None = None
    credential: str | None = None


class IceConfigResponse(BaseModel):
    ice_servers: list[IceServer]


class CreateCallRequest(BaseModel):
    call_type: str = Field(pattern="^(audio|video)$")
    participant_ids: list[str] = Field(min_length=1)
    conversation_id: str | None = None


class CallResponse(BaseModel):
    id: str
    call_type: str
    status: str
    caller_id: str
    participant_ids: list[str]
    conversation_id: str | None
    is_group: bool
    # "mesh" = peer-to-peer (1:1); "sfu" = join the LiveKit room with a token.
    mode: str = "mesh"
    created_at: str


class SignalRequest(BaseModel):
    to_user_id: str
    signal_type: str = Field(description="offer|answer|ice|hangup|screen")
    sdp: dict | None = None
    candidate: dict | None = None


class CallTokenResponse(BaseModel):
    """Everything a client needs to join the SFU room for a group call."""

    room: str
    url: str
    token: str
    expires_in: int
