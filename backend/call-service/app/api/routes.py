import logging

from app.core.config import settings
from app.core.deps import get_current_user_id
from app.schemas.calls import (
    CallResponse,
    CallTokenResponse,
    CreateCallRequest,
    IceConfigResponse,
    IceServer,
    SignalRequest,
)
from app.services import livekit_service
from app.services.call_publisher import notify_users
from app.services.call_store import call_store
from app.services.turn_service import build_ice_servers
from fastapi import APIRouter, Depends, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["calls"])


def _to_response(room) -> CallResponse:
    return CallResponse(
        id=room.id,
        call_type=room.call_type,
        status=room.status,
        caller_id=room.caller_id,
        participant_ids=room.participant_ids,
        conversation_id=room.conversation_id,
        is_group=room.is_group,
        mode=room.mode,
        created_at=room.created_at.isoformat(),
    )


@router.get("/ice", response_model=IceConfigResponse)
async def ice_config(user_id: str = Depends(get_current_user_id)) -> IceConfigResponse:
    raw = build_ice_servers(user_id)
    servers = []
    for entry in raw:
        urls = entry["urls"]
        if isinstance(urls, str):
            urls = [urls]
        servers.append(
            IceServer(
                urls=urls,
                username=entry.get("username"),
                credential=entry.get("credential"),
            )
        )
    return IceConfigResponse(ice_servers=servers)


@router.post("/calls", response_model=CallResponse, status_code=201)
async def create_call(
    body: CreateCallRequest,
    user_id: str = Depends(get_current_user_id),
) -> CallResponse:
    # Routing decision: a 1:1 call stays peer-to-peer (mesh) — lowest latency and
    # media never traverses the server. A group call (> 2 participants) routes
    # through the LiveKit SFU when it is configured; otherwise it degrades to mesh
    # rather than hard-failing (full mesh is poor but functional for tiny groups).
    total_participants = len({user_id, *body.participant_ids})
    use_sfu = total_participants >= settings.sfu_min_participants and livekit_service.is_enabled()
    room = call_store.create(
        user_id,
        call_type=body.call_type,
        participant_ids=body.participant_ids,
        conversation_id=body.conversation_id,
        is_group=len(body.participant_ids) > 1,
        mode="sfu" if use_sfu else "mesh",
    )
    await notify_users(
        event_name="call.incoming",
        target_user_ids=room.participant_ids,
        payload={
            "call_id": room.id,
            "call_type": room.call_type,
            "caller_id": user_id,
            "is_group": room.is_group,
            "mode": room.mode,
            "participant_ids": room.participant_ids,
        },
        exclude_user_id=user_id,
    )
    return _to_response(room)


@router.get("/calls/{call_id}", response_model=CallResponse)
async def get_call(call_id: str, user_id: str = Depends(get_current_user_id)) -> CallResponse:
    room = call_store.participant(call_id, user_id)
    if not room:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Call not found"}})
    return _to_response(room)


@router.post("/calls/{call_id}/accept", response_model=CallResponse)
async def accept_call(call_id: str, user_id: str = Depends(get_current_user_id)) -> CallResponse:
    room = call_store.participant(call_id, user_id)
    if not room:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Call not found"}})
    call_store.update_status(call_id, "active")
    room = call_store.get(call_id)
    assert room
    await notify_users(
        event_name="call.accepted",
        target_user_ids=room.participant_ids,
        payload={"call_id": call_id, "user_id": user_id},
        exclude_user_id=user_id,
    )
    return _to_response(room)


@router.post("/calls/{call_id}/reject")
async def reject_call(call_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    room = call_store.participant(call_id, user_id)
    if not room:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Call not found"}})
    call_store.update_status(call_id, "rejected")
    await notify_users(
        event_name="call.rejected",
        target_user_ids=room.participant_ids,
        payload={"call_id": call_id, "user_id": user_id},
    )
    return {"ok": True}


@router.post("/calls/{call_id}/end")
async def end_call(call_id: str, user_id: str = Depends(get_current_user_id)) -> dict:
    room = call_store.participant(call_id, user_id)
    if not room:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Call not found"}})
    call_store.update_status(call_id, "ended")
    await notify_users(
        event_name="call.ended",
        target_user_ids=room.participant_ids,
        payload={"call_id": call_id, "user_id": user_id},
    )
    return {"ok": True}


@router.post("/calls/{call_id}/signal")
async def relay_signal(
    call_id: str,
    body: SignalRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    room = call_store.participant(call_id, user_id)
    if not room:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Call not found"}})
    if body.to_user_id not in room.participant_ids:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Not a participant"}})
    await notify_users(
        event_name="call.signal",
        target_user_ids=[body.to_user_id],
        payload={
            "call_id": call_id,
            "from_user_id": user_id,
            "signal_type": body.signal_type,
            "sdp": body.sdp,
            "candidate": body.candidate,
        },
    )
    return {"ok": True}


@router.get("/calls", response_model=list[CallResponse])
async def list_calls(user_id: str = Depends(get_current_user_id)) -> list[CallResponse]:
    return [_to_response(r) for r in call_store.list_for_user(user_id)]


@router.post("/calls/{call_id}/token", response_model=CallTokenResponse)
async def sfu_join_token(
    call_id: str,
    user_id: str = Depends(get_current_user_id),
) -> CallTokenResponse:
    """Mint a LiveKit join token for a group (SFU) call.

    Authorization is enforced here, not by the SFU: only an actual participant of
    this call can obtain a token, and the token is scoped to this room + identity.
    """
    room = call_store.participant(call_id, user_id)
    if not room:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Call not found"}})
    if room.mode != "sfu":
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "NOT_SFU", "message": "1:1 calls are peer-to-peer; no SFU token needed"}},
        )
    if not livekit_service.is_enabled():
        raise HTTPException(
            status_code=503,
            detail={"error": {"code": "SFU_UNAVAILABLE", "message": "Group calling is temporarily unavailable"}},
        )
    token, ttl = livekit_service.mint_join_token(room=call_id, identity=user_id)
    return CallTokenResponse(room=call_id, url=settings.livekit_url, token=token, expires_in=ttl)


@router.post("/livekit/webhook")
async def livekit_webhook(request: Request) -> dict:
    """Reconcile SFU room state from LiveKit's signed webhooks.

    No user auth — the request is authenticated by LiveKit's signed token over the
    raw body (verify_webhook). Keeps participant presence and call lifecycle in
    sync (e.g. auto-end the call once the room empties)."""
    body = await request.body()
    try:
        event = livekit_service.verify_webhook(body=body, auth_header=request.headers.get("authorization"))
    except livekit_service.LiveKitError as exc:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "WEBHOOK_REJECTED", "message": "Invalid webhook signature"}},
        ) from exc

    name = event.get("event")
    room_name = (event.get("room") or {}).get("name") or ""
    identity = (event.get("participant") or {}).get("identity") or ""

    if name == "participant_joined" and room_name and identity:
        call_store.mark_joined(room_name, identity)
    elif name == "participant_left" and room_name and identity:
        room = call_store.mark_left(room_name, identity)
        # Auto-end the call once the SFU room has emptied out.
        if room and not room.joined and room.status not in ("ended", "rejected"):
            call_store.update_status(room_name, "ended")
            await notify_users(
                event_name="call.ended",
                target_user_ids=room.participant_ids,
                payload={"call_id": room_name, "reason": "empty"},
            )
    elif name == "room_finished" and room_name:
        room = call_store.update_status(room_name, "ended")
        if room:
            await notify_users(
                event_name="call.ended",
                target_user_ids=room.participant_ids,
                payload={"call_id": room_name, "reason": "room_finished"},
            )

    return {"ok": True}
