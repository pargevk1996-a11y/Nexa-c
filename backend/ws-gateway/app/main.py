"""WebSocket gateway — horizontal scaling via Redis pub/sub + NATS JetStream."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

from app.core.config import settings
from app.services.chat_client import ChatClient
from app.services.local_registry import LocalConnectionRegistry
from app.services.nats_consumer import start_nats_consumer, stop_nats_consumer
from app.ws.connection_manager import ConnectionManager
from app.ws.handler import WsHandler
from fastapi import FastAPI, WebSocket
from nexa_shared.observability import setup_observability
from nexa_shared.realtime.bus import RETRY_STREAM, EventBus, fanout_event
from nexa_shared.realtime.events import RealtimeEvent, WsFrame, ws_frame_to_json
from nexa_shared.realtime.registry import ConnectionRegistry
from nexa_shared.schemas.common import HealthResponse
from redis.asyncio import Redis

logger = logging.getLogger(__name__)

manager = ConnectionManager()
redis: Redis | None = None
bus: EventBus | None = None
registry: ConnectionRegistry | None = None
chat_client = ChatClient()


async def _deliver_to_local_connections(event: RealtimeEvent) -> None:
    for user_id in event.target_user_ids:
        for conn in manager.connections_for_user(user_id):
            conv_id = event.conversation_id
            if conv_id and event.name.startswith("typing."):
                if conv_id not in conn.subscribed_conversations:
                    continue
            frame = WsFrame(type="event", name=event.name, payload=event.payload)
            try:
                await conn.websocket.send_text(ws_frame_to_json(frame))
            except Exception:
                manager.remove(conn.conn_id)


async def _retry_worker() -> None:
    if not redis:
        return
    last_id = "0"
    while True:
        try:
            rows = await redis.xread({RETRY_STREAM: last_id}, count=10, block=5000)
            for _stream, messages in rows:
                for msg_id, fields in messages:
                    last_id = msg_id
                    raw = fields.get("payload") or fields.get(b"payload")
                    if isinstance(raw, bytes):
                        raw = raw.decode()
                    try:
                        event = RealtimeEvent.from_json(raw)
                        await _deliver_to_local_connections(event)
                    except Exception:
                        logger.exception("retry delivery failed")
        except asyncio.CancelledError:
            break
        except Exception:
            await asyncio.sleep(1)


async def _publish_event(event: RealtimeEvent) -> None:
    if not bus or not registry:
        await _deliver_to_local_connections(event)
        return
    await fanout_event(bus, registry, event)


async def _on_nats_event(event_name: str, conversation_id: str, payload: dict[str, Any]) -> None:
    """Deliver a NATS-sourced chat event to locally connected WebSocket clients."""
    RealtimeEvent(
        name=event_name,
        conversation_id=conversation_id,
        target_user_ids=[],  # broadcast to all local subscribers of this conversation
        payload=payload,
    )
    # Fan-out to all local connections subscribed to this conversation
    for conn in manager.all_connections():
        if conversation_id and conversation_id in conn.subscribed_conversations:
            frame = WsFrame(type="event", name=event_name, payload=payload)
            try:
                await conn.websocket.send_text(ws_frame_to_json(frame))
            except Exception:
                manager.remove(conn.conn_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis, bus, registry
    retry_task: asyncio.Task | None = None
    try:
        redis = Redis.from_url(settings.redis_url, decode_responses=True)
        await redis.ping()
        registry = ConnectionRegistry(redis)
        bus = EventBus(redis)
        await bus.subscribe_node(settings.node_id, _deliver_to_local_connections)
        retry_task = asyncio.create_task(_retry_worker())
        logger.info("ws-gateway connected to Redis at %s", settings.redis_url)
    except Exception as exc:
        logger.warning(
            "Redis unavailable (%s); ws-gateway using in-memory registry (local dev only)",
            exc,
        )
        redis = None
        bus = None
        registry = LocalConnectionRegistry()
    # NATS JetStream consumer (optional — no-op if NATS_URL not set)
    if settings.nats_url:
        await start_nats_consumer(settings.nats_url, settings.node_id, _on_nats_event)
    yield
    if retry_task:
        retry_task.cancel()
    await stop_nats_consumer()
    await chat_client.close()
    if bus:
        await bus.close()
    if redis:
        await redis.aclose()


app = FastAPI(title=settings.service_name, version="0.1.0", lifespan=lifespan)
setup_observability(app, settings.service_name)


@app.websocket("/api/v1/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    if registry is None:
        await websocket.close(code=1011, reason="Gateway not ready")
        return
    h = WsHandler(
        manager=manager,
        registry=registry,
        chat=chat_client,
        deliver_local=_deliver_to_local_connections,
        publish_event=_publish_event,
    )
    await h.handle_connection(websocket)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.service_name)


@app.get("/health/ready")
async def ready() -> dict:
    if redis is None:
        return {"status": "degraded", "redis": False, "connections": manager.connection_count}
    try:
        await redis.ping()
        return {
            "status": "ok",
            "redis": True,
            "node_id": settings.node_id,
            "connections": manager.connection_count,
        }
    except Exception:
        return {"status": "unavailable", "redis": False, "connections": manager.connection_count}


@app.get("/stats")
async def stats() -> dict:
    return {
        "service": settings.service_name,
        "node_id": settings.node_id,
        "connections": manager.connection_count,
        "max_connections": settings.max_connections_per_node,
        "redis": redis is not None,
    }
