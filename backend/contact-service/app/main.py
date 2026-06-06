from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router
from app.core.config import settings
from nexa_shared.observability import setup_observability
from nexa_shared.schemas.common import HealthResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title=settings.service_name, version="0.1.0", lifespan=lifespan)
setup_observability(app, settings.service_name)
app.include_router(router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.service_name)
