from fastapi import APIRouter, Depends

from app.core.deps import get_current_user_id, get_current_user_id_or_internal
from app.schemas.ai import (
    AssistantChatRequest,
    AssistantChatResponse,
    ModerateRequest,
    ModerateResponse,
    SearchHit,
    SearchRequest,
    SearchResponse,
    SmartReplyRequest,
    SmartReplyResponse,
    SpamScoreRequest,
    SpamScoreResponse,
    SummarizeRequest,
    SummarizeResponse,
    TranscribeRequest,
    TranscribeResponse,
    TranslateRequest,
    TranslateResponse,
)
from app.services.provider import get_provider
from app.services.rate_limiter import rate_limiter
from app.services.semantic_index import semantic_index

router = APIRouter(prefix="/api/v1", tags=["ai"])


@router.post("/assistant/chat", response_model=AssistantChatResponse)
async def assistant_chat(
    body: AssistantChatRequest,
    user_id: str = Depends(get_current_user_id),
) -> AssistantChatResponse:
    rate_limiter.check(user_id)
    provider = get_provider()
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    messages.insert(0, {"role": "system", "content": "You are Nexa, a helpful secure chat assistant. Be concise."})
    reply = await provider.chat(messages)
    return AssistantChatResponse(reply=reply, provider=provider.provider_name)


@router.post("/reply/suggest", response_model=SmartReplyResponse)
async def smart_reply(
    body: SmartReplyRequest,
    user_id: str = Depends(get_current_user_id),
) -> SmartReplyResponse:
    rate_limiter.check(user_id)
    provider = get_provider()
    recent = [{"sender": m.sender, "text": m.text} for m in body.recent_messages]
    suggestions = await provider.smart_reply(recent)
    return SmartReplyResponse(suggestions=suggestions[:3])


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    body: TranscribeRequest,
    user_id: str = Depends(get_current_user_id),
) -> TranscribeResponse:
    rate_limiter.check(user_id)
    provider = get_provider()
    text, lang = await provider.transcribe(body.audio_base64, body.audio_format, body.language)
    return TranscribeResponse(text=text, language=lang, provider=provider.provider_name)


@router.post("/translate", response_model=TranslateResponse)
async def translate(
    body: TranslateRequest,
    user_id: str = Depends(get_current_user_id),
) -> TranslateResponse:
    rate_limiter.check(user_id)
    provider = get_provider()
    text, src = await provider.translate(body.text, body.source_lang, body.target_lang)
    return TranslateResponse(
        text=text,
        source_lang=src,
        target_lang=body.target_lang,
        provider=provider.provider_name,
    )


@router.post("/moderate", response_model=ModerateResponse)
async def moderate(
    body: ModerateRequest,
    user_id: str = Depends(get_current_user_id_or_internal),
) -> ModerateResponse:
    rate_limiter.check(user_id)
    provider = get_provider()
    result = await provider.moderate(body.text, body.context)
    return ModerateResponse(provider=provider.provider_name, **result)


@router.post("/spam/score", response_model=SpamScoreResponse)
async def spam_score(
    body: SpamScoreRequest,
    user_id: str = Depends(get_current_user_id_or_internal),
) -> SpamScoreResponse:
    rate_limiter.check(user_id)
    provider = get_provider()
    result = await provider.spam_score(body.text)
    return SpamScoreResponse(provider=provider.provider_name, **result)


@router.post("/search", response_model=SearchResponse)
async def search_messages(
    body: SearchRequest,
    user_id: str = Depends(get_current_user_id),
) -> SearchResponse:
    rate_limiter.check(user_id)
    provider = get_provider()
    inline = [{"id": m.id, "text": m.text, "sent_at": m.sent_at} for m in body.messages]
    if inline:
        semantic_index.upsert_batch(user_id, body.conversation_id, inline)

    mode = body.mode
    if mode == "smart":
        keyword_hits = semantic_index.search(
            user_id, body.conversation_id, body.query, mode="keyword", limit=body.limit, inline_docs=inline or None
        )
        semantic_hits = semantic_index.search(
            user_id, body.conversation_id, body.query, mode="semantic", limit=body.limit, inline_docs=inline or None
        )
        merged: dict[str, dict] = {}
        for hit in keyword_hits + semantic_hits:
            prev = merged.get(hit["id"])
            if not prev or hit["score"] > prev["score"]:
                merged[hit["id"]] = hit
        hits = sorted(merged.values(), key=lambda h: h["score"], reverse=True)[: body.limit]
    else:
        hits = semantic_index.search(
            user_id,
            body.conversation_id,
            body.query,
            mode=mode if mode in ("keyword", "semantic") else "semantic",
            limit=body.limit,
            inline_docs=inline or None,
        )

    return SearchResponse(
        hits=[SearchHit(**h) for h in hits],
        provider=provider.provider_name,
    )


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(
    body: SummarizeRequest,
    user_id: str = Depends(get_current_user_id),
) -> SummarizeResponse:
    rate_limiter.check(user_id)
    provider = get_provider()
    msgs = [{"sender": m.sender, "text": m.text} for m in body.messages]
    summary, bullets = await provider.summarize(msgs, body.max_length)
    return SummarizeResponse(summary=summary, bullet_points=bullets, provider=provider.provider_name)
