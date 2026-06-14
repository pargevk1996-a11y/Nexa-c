from contextlib import asynccontextmanager

from fastapi import FastAPI
from nexa_shared.observability import setup_observability
from nexa_shared.schemas.common import HealthResponse

from app.api.routes import router
from app.core.config import settings


async def _init_postgres() -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.repositories.contact_repository import PostgresBlockStore, PostgresRequestStore
    from app.services.block_store import block_store
    from app.services.request_store import request_store

    engine = create_async_engine(settings.database_url, pool_size=10, max_overflow=20, pool_pre_ping=True)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    request_store._switch_to_postgres(PostgresRequestStore(sm))
    block_store._switch_to_postgres(PostgresBlockStore(sm))


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.database_url:
        await _init_postgres()
    yield


app = FastAPI(title=settings.service_name, version="0.1.0", lifespan=lifespan)
setup_observability(app, settings.service_name)
app.include_router(router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.service_name)
