from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user_id
from app.schemas.contacts import BlockUserRequest, BlockedUserResponse
from app.services.block_store import block_store

router = APIRouter(prefix="/api/v1/contacts", tags=["contacts"])


@router.get("/blocks", response_model=list[BlockedUserResponse])
async def list_blocked(user_id: str = Depends(get_current_user_id)) -> list[BlockedUserResponse]:
    return [
        BlockedUserResponse(
            user_id=b.blocked_user_id,
            display_name=None,
            blocked_at=b.blocked_at.isoformat(),
            reason=b.reason,
        )
        for b in block_store.list_blocks(user_id)
    ]


@router.post("/blocks", response_model=BlockedUserResponse, status_code=201)
async def block_user(
    body: BlockUserRequest,
    user_id: str = Depends(get_current_user_id),
) -> BlockedUserResponse:
    try:
        rec = block_store.block(user_id, body.user_id, reason=body.reason)
    except ValueError as e:
        if str(e) == "SELF_BLOCK":
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "SELF_BLOCK", "message": "Cannot block yourself"}},
            ) from e
        raise
    return BlockedUserResponse(
        user_id=rec.blocked_user_id,
        blocked_at=rec.blocked_at.isoformat(),
        reason=rec.reason,
    )


@router.delete("/blocks/{blocked_user_id}")
async def unblock_user(
    blocked_user_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, bool]:
    if not block_store.unblock(user_id, blocked_user_id):
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Not blocked"}})
    return {"ok": True}
