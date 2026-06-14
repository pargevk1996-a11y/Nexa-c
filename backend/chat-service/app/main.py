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


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        await _init_postgres()
    await init_publisher()
    yield
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
