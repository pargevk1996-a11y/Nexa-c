from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.core.deps import get_current_user_id
from app.services.event_publisher import PresencePublisher
from app.services.presence_store import PresenceStore

router = APIRouter(prefix="/api/v1/presence", tags=["presence"])


class PresenceBody(BaseModel):
    is_online: bool = True
    status_text: str | None = None


class TypingBody(BaseModel):
    conversation_id: str = Field(min_length=1)
    is_typing: bool = True


def _store(request: Request) -> PresenceStore:
    return request.app.state.presence_store


def _pub(request: Request) -> PresencePublisher:
    return request.app.state.publisher


@router.post("/heartbeat")
async def heartbeat(
    body: PresenceBody,
    request: Request,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    store = _store(request)
    pub = _pub(request)
    data = await store.set_online(user_id, is_online=body.is_online, status_text=body.status_text)
    await pub.broadcast_presence(user_id, data)
    return data


@router.get("/users/{target_user_id}")
async def get_presence(
    target_user_id: str,
    request: Request,
    _viewer: str = Depends(get_current_user_id),
) -> dict:
    store = _store(request)
    return await store.get(target_user_id) or {"user_id": target_user_id, "is_online": False}


@router.post("/typing")
async def typing(
    body: TypingBody,
    request: Request,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    store = _store(request)
    pub = _pub(request)
    user_ids = await store.set_typing(user_id, body.conversation_id, body.is_typing)
    await pub.broadcast_typing(body.conversation_id, user_id, body.is_typing)
    return {"conversation_id": body.conversation_id, "user_ids": user_ids}


@router.get("/typing/{conversation_id}")
async def get_typing(
    conversation_id: str,
    request: Request,
    _user_id: str = Depends(get_current_user_id),
) -> dict:
    store = _store(request)
    return {"user_ids": await store.get_typing(conversation_id)}
