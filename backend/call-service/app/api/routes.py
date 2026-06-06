from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user_id
from app.schemas.calls import (
    CallResponse,
    CreateCallRequest,
    IceConfigResponse,
    IceServer,
    SignalRequest,
)
from app.services.call_publisher import notify_users
from app.services.call_store import call_store
from app.services.turn_service import build_ice_servers

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
    room = call_store.create(
        user_id,
        call_type=body.call_type,
        participant_ids=body.participant_ids,
        conversation_id=body.conversation_id,
        is_group=len(body.participant_ids) > 1,
    )
    await notify_users(
        event_name="call.incoming",
        target_user_ids=room.participant_ids,
        payload={
            "call_id": room.id,
            "call_type": room.call_type,
            "caller_id": user_id,
            "is_group": room.is_group,
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
