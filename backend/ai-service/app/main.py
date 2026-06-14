from app.api.routes import router
from app.core.config import settings
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from nexa_shared.observability import setup_observability
from nexa_shared.schemas.common import HealthResponse

app = FastAPI(title=settings.service_name, version="0.1.0")
setup_observability(app, settings.service_name)
app.include_router(router)


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
