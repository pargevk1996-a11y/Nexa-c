from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant|system)$")
    content: str = Field(min_length=1, max_length=8000)


class AssistantChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    conversation_id: str | None = None


class AssistantChatResponse(BaseModel):
    reply: str
    provider: str


class ContextMessage(BaseModel):
    sender: str = ""
    text: str = Field(min_length=1, max_length=4000)


class SmartReplyRequest(BaseModel):
    conversation_id: str | None = None
    recent_messages: list[ContextMessage] = Field(default_factory=list, max_length=20)


class SmartReplyResponse(BaseModel):
    suggestions: list[str]


class TranscribeRequest(BaseModel):
    audio_base64: str = Field(min_length=8)
    audio_format: str = Field(default="webm", pattern="^(webm|wav|mp3|ogg|m4a)$")
    language: str | None = Field(default=None, max_length=8)


class TranscribeResponse(BaseModel):
    text: str
    language: str | None = None
    provider: str


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    source_lang: str | None = Field(default=None, max_length=8)
    target_lang: str = Field(default="en", max_length=8)


class TranslateResponse(BaseModel):
    text: str
    source_lang: str | None = None
    target_lang: str
    provider: str


class ModerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    context: str | None = None


class ModerateResponse(BaseModel):
    allowed: bool
    score: float = Field(ge=0, le=1)
    categories: dict[str, float] = Field(default_factory=dict)
    reason: str | None = None
    provider: str


class SpamScoreRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    sender_id: str | None = None
    conversation_id: str | None = None


class SpamScoreResponse(BaseModel):
    is_spam: bool
    score: float = Field(ge=0, le=1)
    signals: list[str] = Field(default_factory=list)
    provider: str


class SearchDocument(BaseModel):
    id: str
    text: str = Field(min_length=1, max_length=8000)
    sent_at: str | None = None


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    conversation_id: str | None = None
    messages: list[SearchDocument] = Field(default_factory=list, max_length=500)
    mode: str = Field(default="smart", pattern="^(keyword|semantic|smart)$")
    limit: int = Field(default=20, ge=1, le=50)


class SearchHit(BaseModel):
    id: str
    text: str
    score: float
    sent_at: str | None = None
    match_type: str


class SearchResponse(BaseModel):
    hits: list[SearchHit]
    provider: str


class SummarizeRequest(BaseModel):
    conversation_id: str | None = None
    messages: list[ContextMessage] = Field(min_length=1, max_length=200)
    max_length: int = Field(default=280, ge=50, le=1000)


class SummarizeResponse(BaseModel):
    summary: str
    bullet_points: list[str] = Field(default_factory=list)
    provider: str
