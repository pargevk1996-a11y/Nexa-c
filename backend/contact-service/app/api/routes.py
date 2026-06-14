from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.deps import get_current_user_id
from app.schemas.contacts import (
    BlockedUserResponse,
    BlockUserRequest,
    ContactRequestResponse,
    ContactStatusResponse,
    SendContactRequestBody,
)
from app.services.block_store import block_store
from app.services.request_store import request_store
from app.services.service_clients import (
    create_dm_conversation,
    delete_dm_conversation,
    dispatch_contact_request_notification,
    unlock_conversation,
)

# prefix="/api/v1"
# The API gateway proxies /api/v1/contacts/<path> → contact-service /api/v1/<path>
# so individual routes must NOT include the "/contacts/" prefix.
router = APIRouter(prefix="/api/v1", tags=["contacts"])


def _req_response(req) -> ContactRequestResponse:
    return ContactRequestResponse(
        id=req.id,
        from_user_id=req.from_user_id,
        to_user_id=req.to_user_id,
        status=req.status,
        conversation_id=req.conversation_id,
        created_at=req.created_at.isoformat(),
        resolved_at=req.resolved_at.isoformat() if req.resolved_at else None,
    )


# ── Blocks ──────────────────────────────────────────────────────────────────

@router.get("/blocks", response_model=list[BlockedUserResponse])
async def list_blocked(user_id: str = Depends(get_current_user_id)) -> list[BlockedUserResponse]:
    return [
        BlockedUserResponse(
            user_id=b.blocked_user_id,
            display_name=None,
            blocked_at=b.blocked_at.isoformat(),
            reason=b.reason,
        )
        for b in await block_store.list_blocks(user_id)
    ]


@router.post("/blocks", response_model=BlockedUserResponse, status_code=201)
async def block_user(body: BlockUserRequest, user_id: str = Depends(get_current_user_id)) -> BlockedUserResponse:
    try:
        rec = await block_store.block(user_id, body.user_id, reason=body.reason)
    except ValueError as e:
        if str(e) == "SELF_BLOCK":
            raise HTTPException(400, detail={"error": {"code": "SELF_BLOCK", "message": "Cannot block yourself"}}) from e
        raise
    return BlockedUserResponse(user_id=rec.blocked_user_id, blocked_at=rec.blocked_at.isoformat(), reason=rec.reason)


@router.delete("/blocks/{blocked_user_id}")
async def unblock_user(blocked_user_id: str, user_id: str = Depends(get_current_user_id)) -> dict[str, bool]:
    if not await block_store.unblock(user_id, blocked_user_id):
        raise HTTPException(404, detail={"error": {"code": "NOT_FOUND", "message": "Not blocked"}})
    return {"ok": True}


# ── Contact Requests ─────────────────────────────────────────────────────────

@router.post("/requests", response_model=ContactRequestResponse, status_code=201)
async def send_contact_request(
    body: SendContactRequestBody,
    request: Request,
    user_id: str = Depends(get_current_user_id),
) -> ContactRequestResponse:
    try:
        req = await request_store.send(user_id, body.to_user_id)
    except ValueError as e:
        code_map = {
            "SELF_REQUEST": (400, "Cannot send request to yourself"),
            "ALREADY_PENDING": (409, "Request already pending"),
            "ALREADY_CONTACTS": (409, "Already contacts"),
        }
        code = str(e)
        status_code, msg = code_map.get(code, (400, code))
        raise HTTPException(status_code, detail={"error": {"code": code, "message": msg}}) from e

    # Create DM conversation locked for recipient (they can't read messages until accepted)
    auth_header = request.headers.get("authorization", "")
    token = auth_header.split(" ", 1)[-1] if " " in auth_header else ""
    if token:
        conv_id = await create_dm_conversation(user_id, body.to_user_id, token=token)
        if conv_id:
            req.conversation_id = conv_id
            await request_store.update_conversation_id(req.id, conv_id)

    # Push notification to recipient
    await dispatch_contact_request_notification(
        from_user_id=user_id,
        from_username=body.from_username or user_id,
        to_user_id=body.to_user_id,
        request_id=req.id,
    )

    return _req_response(req)


@router.get("/requests/incoming", response_model=list[ContactRequestResponse])
async def list_incoming_requests(user_id: str = Depends(get_current_user_id)) -> list[ContactRequestResponse]:
    return [_req_response(r) for r in await request_store.list_incoming(user_id)]


@router.get("/requests/outgoing", response_model=list[ContactRequestResponse])
async def list_outgoing_requests(user_id: str = Depends(get_current_user_id)) -> list[ContactRequestResponse]:
    return [_req_response(r) for r in await request_store.list_outgoing(user_id)]


@router.patch("/requests/{request_id}/accept", response_model=ContactRequestResponse)
async def accept_request(request_id: str, user_id: str = Depends(get_current_user_id)) -> ContactRequestResponse:
    try:
        req = await request_store.accept(request_id, user_id)
    except ValueError as e:
        code = str(e)
        status_code = 404 if code == "NOT_FOUND" else (403 if code == "FORBIDDEN" else 409)
        raise HTTPException(status_code, detail={"error": {"code": code, "message": code}}) from e
    if req.conversation_id:
        await unlock_conversation(req.conversation_id)
    return _req_response(req)


@router.patch("/requests/{request_id}/decline", response_model=ContactRequestResponse)
async def decline_request(request_id: str, user_id: str = Depends(get_current_user_id)) -> ContactRequestResponse:
    try:
        req = await request_store.decline(request_id, user_id)
    except ValueError as e:
        code = str(e)
        status_code = 404 if code == "NOT_FOUND" else (403 if code == "FORBIDDEN" else 409)
        raise HTTPException(status_code, detail={"error": {"code": code, "message": code}}) from e
    if req.conversation_id:
        await delete_dm_conversation(req.conversation_id)
    return _req_response(req)


@router.patch("/requests/{request_id}/cancel", response_model=ContactRequestResponse)
async def cancel_request(request_id: str, user_id: str = Depends(get_current_user_id)) -> ContactRequestResponse:
    try:
        req = await request_store.cancel(request_id, user_id)
    except ValueError as e:
        code = str(e)
        status_code = 404 if code == "NOT_FOUND" else (403 if code == "FORBIDDEN" else 409)
        raise HTTPException(status_code, detail={"error": {"code": code, "message": code}}) from e
    if req.conversation_id:
        await delete_dm_conversation(req.conversation_id)
    return _req_response(req)


# ── Contact Status ───────────────────────────────────────────────────────────

@router.get("/status/{other_user_id}", response_model=ContactStatusResponse)
async def get_contact_status(
    other_user_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ContactStatusResponse:
    status = await request_store.get_status(user_id, other_user_id)
    req = await request_store.get_pending_request(user_id, other_user_id)
    # For accepted contacts, also look up the resolved request to get conversation_id
    if status == "contacts" and req is None:
        req = await request_store.get_resolved_request(user_id, other_user_id)
    return ContactStatusResponse(
        status=status,
        request_id=req.id if req else None,
        conversation_id=req.conversation_id if req else None,
    )
