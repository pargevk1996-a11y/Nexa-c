import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from nexa_shared.observability import setup_observability
from nexa_shared.schemas.common import HealthResponse

from app.api.group_routes import router as group_router
from app.api.routes import router
from app.core.config import settings
from app.core.redis import close_redis
from app.services.realtime_publisher import close_publisher, init_publisher


async def _init_postgres() -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.repository import PostgresChatStore
    from app.services.chat_store import chat_store

    engine = create_async_engine(
        settings.database_url, pool_size=10, max_overflow=20, pool_pre_ping=True
    )
    sm = async_sessionmaker(engine, expire_on_commit=False)
    chat_store._switch_to_postgres(PostgresChatStore(sm))

    # Ensure the "send later" queue table exists (idempotent; leaves every other
    # table — incl. the partitioned messages table — untouched).
    from app.db.models import ScheduledMessageRow

    async with engine.begin() as conn:
        await conn.run_sync(lambda c: ScheduledMessageRow.__table__.create(c, checkfirst=True))


logger = logging.getLogger("nexa.chat.scheduler")


async def _deliver_scheduled(item: dict) -> None:
    """Deliver one due scheduled message exactly like the send endpoint does."""
    from app.api.routes import _msg_response
    from app.services.chat_store import chat_store
    from app.services.notification_client import dispatch_push_for_message
    from app.services.realtime_publisher import publish_message_event

    conv = await chat_store.get_conversation_member(item["conversation_id"], item["sender_id"])
    if not conv:
        await chat_store.mark_scheduled_sent(item["id"])
        return
    try:
        msg, is_new = await chat_store.send_message(
            item["conversation_id"],
            item["sender_id"],
            client_msg_id=None,
            body=item["body"],
            content_type=item.get("content_type", "text"),
            reply_to_id=item.get("reply_to_id"),
        )
        response = await _msg_response(msg)
        if is_new:
            await publish_message_event(
                name="message.new",
                conversation_id=item["conversation_id"],
                payload={"message": response.model_dump(), "seq": msg.seq, "conversation_title": conv.title},
                sender_id=item["sender_id"],
            )
            targets = [m.user_id for m in conv.members if m.user_id != item["sender_id"]]
            await dispatch_push_for_message(
                conversation_id=item["conversation_id"],
                message_id=msg.id,
                sender_id=item["sender_id"],
                sender_name=conv.title or "Chat",
                body_preview=response.body,
                silent=False,
                target_user_ids=targets,
                conversation_title=conv.title,
            )
    except Exception:
        logger.exception("scheduled delivery failed for %s", item.get("id"))
    # Mark sent regardless so a poison message never loops forever.
    await chat_store.mark_scheduled_sent(item["id"])


async def _scheduler_loop() -> None:
    """Poll for due scheduled messages every 15s and deliver them."""
    from datetime import UTC, datetime

    from app.services.chat_store import chat_store

    while True:
        try:
            due = await chat_store.fetch_due_scheduled(datetime.now(UTC))
            for item in due:
                await _deliver_scheduled(item)
        except Exception:
            logger.exception("scheduler loop iteration failed")
        await asyncio.sleep(15)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_task: asyncio.Task | None = None
    if settings.database_url:
        await _init_postgres()
        scheduler_task = asyncio.create_task(_scheduler_loop())
    await init_publisher()
    yield
    if scheduler_task:
        scheduler_task.cancel()
    await close_publisher()
    await close_redis()


app = FastAPI(title=settings.service_name, version="0.1.0", lifespan=lifespan)
setup_observability(app, settings.service_name)
app.include_router(router)
app.include_router(group_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "HTTP_ERROR", "message": str(exc.detail)}},
    )


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.service_name)
