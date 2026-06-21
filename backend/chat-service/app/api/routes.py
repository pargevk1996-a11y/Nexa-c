from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.deps import get_current_user_id, verify_internal_secret
from app.schemas.chat import (
    ConversationResponse,
    CreateConversationRequest,
    EditMessageRequest,
    MessageResponse,
    PinRequest,
    ReactionRequest,
    ReadReceiptRequest,
    ScheduledMessageResponse,
    ScheduleMessageRequest,
    SendMessageRequest,
    SetHiddenRequest,
)
from app.services.ai_client import maybe_ai_moderate
from app.services.chat_store import SpaceSettings, chat_store
from app.services.group_service import group_service
from app.services.message_crypto import maybe_decrypt_body
from app.services.notification_client import dispatch_push_for_message
from app.services.realtime_publisher import publish_message_event

router = APIRouter(prefix="/api/v1", tags=["chat"])


async def _conv_response(c, user_id: str) -> ConversationResponse:
    last = await chat_store.get_last_message_preview(c.id)
    unread = await chat_store.get_unread_count(c.id, user_id)
    is_locked = c.locked_for_user_id == user_id
    return ConversationResponse(
        id=c.id,
        type=c.type,
        title=c.title,
        description=c.description,
        slug=c.slug,
        is_public=c.is_public,
        verified=c.verified,
        parent_id=c.parent_id,
        member_count=len(c.members),
        last_message_preview=None if is_locked else last,
        unread_count=unread,
        pinned_message_ids=list(c.pinned_message_ids),
        my_role=group_service.get_member_role(c, user_id),
        peer_user_id=_peer_user_id(c, user_id),
        member_ids=[m.user_id for m in c.members if m.user_id != user_id],
        is_locked=is_locked,
        hidden=bool(getattr(next((m for m in c.members if m.user_id == user_id), None), "hidden", False)),
    )


def _peer_user_id(c, user_id: str) -> str | None:
    if c.type != "dm":
        return None
    for m in c.members:
        if m.user_id != user_id:
            return m.user_id
    return None


async def _msg_response(m) -> MessageResponse:
    reply_count = await chat_store.thread_reply_count(m.id) if m.thread_root_id is None else 0
    return MessageResponse(
        id=m.id,
        conversation_id=m.conversation_id,
        sender_id=m.sender_id,
        seq=m.seq,
        body=maybe_decrypt_body(m.body),
        content_type=m.content_type,
        reply_to_id=m.reply_to_id,
        thread_root_id=m.thread_root_id,
        thread_reply_count=reply_count,
        forward_from_id=m.forward_from_id,
        forward_blocked=m.forward_blocked,
        media_id=m.media_id,
        e2ee_envelope=m.e2ee_envelope,
        expires_at=m.expires_at.isoformat() if m.expires_at else None,
        edited_at=m.edited_at.isoformat() if m.edited_at else None,
        deleted_for_everyone_at=m.deleted_for_everyone_at.isoformat() if m.deleted_for_everyone_at else None,
        silent=m.silent,
        reactions={k: list(v) for k, v in m.reactions.items()},
        created_at=m.created_at.isoformat(),
        delivered_to=list(m.delivered_to),
        read_by=list(m.read_by),
    )


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(user_id: str = Depends(get_current_user_id)) -> list[ConversationResponse]:
    convs = await chat_store.list_for_user(user_id)
    return [await _conv_response(c, user_id) for c in convs]


@router.post("/conversations", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    body: CreateConversationRequest,
    user_id: str = Depends(get_current_user_id),
) -> ConversationResponse:
    settings = None
    if body.type in ("private_group", "public_group", "channel", "broadcast", "community"):
        settings = SpaceSettings(invite_only=body.type == "private_group")
    try:
        c = await chat_store.create_conversation(
            user_id,
            type=body.type,
            title=body.title,
            member_ids=body.member_ids,
            is_public=body.is_public,
            description=body.description,
            slug=body.slug,
            parent_id=body.parent_id,
            verified=body.verified,
            settings=settings,
            locked_for=body.locked_for,
        )
    except ValueError as e:
        if str(e) == "SLUG_TAKEN":
            raise HTTPException(
                status_code=409,
                detail={"error": {"code": "SLUG_TAKEN", "message": "Slug already in use"}},
            ) from e
        raise
    return await _conv_response(c, user_id)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    conversation_id: str,
    before_seq: int | None = None,
    after_seq: int | None = None,
    thread_root_id: str | None = None,
    main_timeline: bool = Query(default=False),
    limit: int = Query(default=50, le=100),
    user_id: str = Depends(get_current_user_id),
) -> list[MessageResponse]:
    conv = await chat_store.get_conversation(conversation_id, user_id)
    locked = conv is not None and conv.locked_for_user_id == user_id
    msgs = await chat_store.list_messages(
        conversation_id,
        user_id,
        before_seq=before_seq,
        after_seq=after_seq,
        thread_root_id=thread_root_id,
        main_timeline_only=main_timeline,
        limit=limit,
    )
    result = []
    for m in msgs:
        r = await _msg_response(m)
        if locked and m.sender_id != user_id:
            r.body = ""
        result.append(r)
    return result


@router.patch("/conversations/{conversation_id}/unlock")
async def unlock_conversation(
    conversation_id: str,
    _: None = Depends(verify_internal_secret),
) -> dict[str, bool]:
    ok = await chat_store.unlock_conversation(conversation_id)
    return {"ok": ok}


@router.patch("/conversations/{conversation_id}/archive")
async def archive_conversation(
    conversation_id: str,
    _: None = Depends(verify_internal_secret),
) -> dict[str, bool]:
    ok = await chat_store.archive_conversation(conversation_id)
    return {"ok": ok}


@router.get("/messages/{message_id}/thread", response_model=list[MessageResponse])
async def get_thread(
    message_id: str,
    user_id: str = Depends(get_current_user_id),
) -> list[MessageResponse]:
    root = await chat_store.get_message(message_id, user_id)
    if not root:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Message not found"}})
    msgs = await chat_store.list_messages(
        root.conversation_id,
        user_id,
        thread_root_id=message_id,
        limit=100,
    )
    return [await _msg_response(m) for m in msgs]


@router.get("/conversations/{conversation_id}/sync")
async def sync_state(
    conversation_id: str,
    after_seq: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    if not await chat_store.get_conversation(conversation_id, user_id):
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Conversation not found"}})

    from app.services.sync_cache import get_cached_sync, set_cached_sync

    cached = await get_cached_sync(conversation_id, user_id, after_seq)
    if cached is not None:
        return cached

    msgs = await chat_store.list_messages(conversation_id, user_id, after_seq=after_seq, limit=200)
    latest_seq = await chat_store.get_latest_seq(conversation_id)
    latest = max((m.seq for m in msgs), default=after_seq)
    latest = max(latest, latest_seq)
    msg_responses = [await _msg_response(m) for m in msgs]
    payload = {
        "conversation_id": conversation_id,
        "after_seq": after_seq,
        "latest_seq": latest,
        "messages": [r.model_dump() for r in msg_responses],
        "sync_required": len(msgs) >= 200,
    }
    await set_cached_sync(conversation_id, user_id, after_seq, payload)
    return payload


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    conversation_id: str,
    body: SendMessageRequest,
    user_id: str = Depends(get_current_user_id),
) -> MessageResponse:
    conv = await chat_store.get_conversation_member(conversation_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Conversation not found"}})

    try:
        verdict = group_service.assert_can_send(
            conv,
            user_id,
            body.body,
            thread_root_id=body.thread_root_id,
        )
    except ValueError as e:
        if str(e) == "NOT_MEMBER":
            raise HTTPException(status_code=403, detail={"error": {"code": "NOT_MEMBER", "message": "Not a member"}}) from e
        raise

    if not verdict.allowed:
        raise HTTPException(
            status_code=429 if verdict.code in ("SLOW_MODE", "RATE_LIMITED") else 403,
            detail={
                "error": {
                    "code": verdict.code or "MODERATION",
                    "message": verdict.message or "Message blocked",
                }
            },
        )

    if conv.settings.auto_mod_level >= 1:
        ai_verdict = await maybe_ai_moderate(body.body, user_id)
        if ai_verdict and not ai_verdict.allowed:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": {
                        "code": ai_verdict.code or "AI_MODERATION",
                        "message": ai_verdict.message or "Message blocked",
                    }
                },
            )

    try:
        msg, is_new = await chat_store.send_message(
            conversation_id,
            user_id,
            client_msg_id=body.client_msg_id,
            body=body.body,
            content_type=body.content_type,
            reply_to_id=body.reply_to_id,
            thread_root_id=body.thread_root_id,
            forward_from_id=body.forward_from_id,
            forward_blocked=body.forward_blocked,
            media_id=body.media_id,
            e2ee_envelope=body.e2ee_envelope,
            silent=body.silent,
        )
    except ValueError as e:
        if str(e) == "NOT_FOUND":
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Conversation not found"}}) from e
        if str(e) == "FORWARD_BLOCKED":
            raise HTTPException(
                status_code=403,
                detail={"error": {"code": "FORWARD_BLOCKED", "message": "This message cannot be forwarded"}},
            ) from e
        if str(e) == "INVALID_THREAD":
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "INVALID_THREAD", "message": "Invalid thread"}},
            ) from e
        raise

    if verdict.auto_flagged:
        group_service.mod_action(
            conv_id=conversation_id,
            actor_id="system",
            action="auto_mod_flag",
            target_message_id=msg.id,
            reason="auto_moderation",
        )

    response = await _msg_response(msg)
    if is_new:
        await publish_message_event(
            name="message.new",
            conversation_id=conversation_id,
            payload={"message": response.model_dump(), "seq": msg.seq, "conversation_title": conv.title},
            sender_id=user_id,
        )
        targets = [m.user_id for m in conv.members if m.user_id != user_id]
        await dispatch_push_for_message(
            conversation_id=conversation_id,
            message_id=msg.id,
            sender_id=user_id,
            sender_name=conv.title or "Chat",
            body_preview=response.body,
            silent=body.silent,
            target_user_ids=targets,
            conversation_title=conv.title,
        )
    return response


@router.patch("/messages/{message_id}", response_model=MessageResponse)
async def edit_message(
    message_id: str,
    body: EditMessageRequest,
    user_id: str = Depends(get_current_user_id),
) -> MessageResponse:
    m = await chat_store.edit_message(message_id, user_id, body.body)
    if not m:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Cannot edit message"}})
    response = await _msg_response(m)
    await publish_message_event(
        name="message.edit",
        conversation_id=m.conversation_id,
        payload={"message": response.model_dump(), "seq": m.seq},
        sender_id=user_id,
    )
    return response


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    for_everyone: bool = False,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    m = await chat_store.get_message(message_id, user_id)
    if not m:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    conv = await chat_store.get_conversation_member(m.conversation_id, user_id)
    if not conv:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}})
    moderator = group_service.assert_can_delete(conv, user_id, m) and m.sender_id != user_id
    if not await chat_store.delete_message(message_id, user_id, for_everyone=for_everyone, moderator=moderator):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Cannot delete message"}})
    if for_everyone and moderator:
        group_service.mod_action(
            conv_id=m.conversation_id,
            actor_id=user_id,
            action="delete_message",
            target_message_id=message_id,
        )
    return {"message": "Deleted"}


@router.post("/messages/{message_id}/reactions", response_model=MessageResponse)
async def react(
    message_id: str,
    body: ReactionRequest,
    user_id: str = Depends(get_current_user_id),
) -> MessageResponse:
    m = await chat_store.add_reaction(message_id, user_id, body.emoji)
    if not m:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Message not found"}})
    return await _msg_response(m)


@router.post("/messages/{message_id}/delivered")
async def delivered(
    message_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    m = await chat_store.get_message(message_id, user_id)
    if not m:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    await chat_store.mark_delivered(message_id, user_id)
    await publish_message_event(
        name="receipt.delivered",
        conversation_id=m.conversation_id,
        payload={"message_id": message_id, "user_id": user_id},
        sender_id=user_id,
    )
    return {"ok": True}


@router.post("/conversations/{conversation_id}/read")
async def read_receipt(
    conversation_id: str,
    body: ReadReceiptRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    if not await chat_store.get_conversation(conversation_id, user_id):
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Conversation not found"}})
    await chat_store.mark_read(conversation_id, user_id, body.up_to_seq)
    await publish_message_event(
        name="receipt.read",
        conversation_id=conversation_id,
        payload={"up_to_seq": body.up_to_seq, "user_id": user_id, "conversation_id": conversation_id},
        sender_id=user_id,
    )
    return {"ok": True}


@router.post("/conversations/{conversation_id}/pins")
async def pin_message(
    conversation_id: str,
    body: PinRequest,
    user_id: str = Depends(get_current_user_id),
) -> ConversationResponse:
    conv = await chat_store.get_conversation_member(conversation_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    try:
        group_service.assert_can_pin(conv, user_id)
    except ValueError as e:
        if str(e) == "FORBIDDEN":
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Forbidden"}}) from e
        raise
    conv = await chat_store.pin_message(conversation_id, user_id, body.message_id, body.pinned)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not found"}})
    return await _conv_response(conv, user_id)


# ── Scheduled ("send later") messages ──────────────────────────────────────
@router.post(
    "/conversations/{conversation_id}/scheduled",
    response_model=ScheduledMessageResponse,
    status_code=201,
)
async def create_scheduled_message(
    conversation_id: str,
    body: ScheduleMessageRequest,
    user_id: str = Depends(get_current_user_id),
) -> ScheduledMessageResponse:
    conv = await chat_store.get_conversation_member(conversation_id, user_id)
    if not conv:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "Conversation not found"}},
        )
    item = await chat_store.create_scheduled(
        conversation_id,
        user_id,
        body.body,
        content_type=body.content_type,
        reply_to_id=body.reply_to_id,
        scheduled_at=body.scheduled_at,
    )
    return ScheduledMessageResponse(**item)


@router.get(
    "/conversations/{conversation_id}/scheduled",
    response_model=list[ScheduledMessageResponse],
)
async def list_scheduled_messages(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
) -> list[ScheduledMessageResponse]:
    items = await chat_store.list_scheduled(conversation_id, user_id)
    return [ScheduledMessageResponse(**i) for i in items]


@router.delete("/scheduled/{scheduled_id}")
async def cancel_scheduled_message(
    scheduled_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    ok = await chat_store.cancel_scheduled(scheduled_id, user_id)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "Scheduled message not found"}},
        )
    return {"ok": True}


@router.patch("/conversations/{conversation_id}/hidden")
async def set_conversation_hidden(
    conversation_id: str,
    body: SetHiddenRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    conv = await chat_store.get_conversation_member(conversation_id, user_id)
    if not conv:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "Conversation not found"}},
        )
    await chat_store.set_hidden(conversation_id, user_id, body.hidden)
    return {"ok": True, "hidden": body.hidden}


# ── E2EE Key Packages ────────────────────────────────────────────────────────
# Each package is { ephemeral_pub: str, ciphertext: str } — an ECIES-wrapped
# group AES key. The server stores opaque ciphertext; it cannot derive the key.

class KeyPackageItem(BaseModel):
    user_id: str
    package: dict[str, Any]

class KeyPackagesBatch(BaseModel):
    packages: list[KeyPackageItem]


@router.get("/conversations/{conversation_id}/key-package")
async def get_key_package(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    conv = await chat_store.get_conversation(conversation_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Conversation not found"}})
    import json

    from app.core.redis import get_redis
    redis = await get_redis()
    raw = await redis.get(f"kp:{conversation_id}:{user_id}")
    if not raw:
        return {"package": None}
    return {"package": json.loads(raw)}


@router.put("/conversations/{conversation_id}/key-packages")
async def set_key_packages(
    conversation_id: str,
    body: KeyPackagesBatch,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    conv = await chat_store.get_conversation(conversation_id, user_id)
    if not conv:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Conversation not found"}})
    import json

    from app.core.redis import get_redis
    redis = await get_redis()
    # TTL = 90 days; refreshed whenever the group key rotates
    ttl = 60 * 60 * 24 * 90
    for item in body.packages:
        await redis.set(f"kp:{conversation_id}:{item.user_id}", json.dumps(item.package), ex=ttl)
    return {"ok": True}
