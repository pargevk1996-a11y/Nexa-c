from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from nexa_shared.observability import setup_observability
from nexa_shared.schemas.common import HealthResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.api.admin_flags import router as admin_flags_router
from app.api.proxy import get_client
from app.api.proxy import router as proxy_router
from app.api.routes import router
from app.api.security_telemetry import router as security_telemetry_router
from app.core.config import settings
from app.middleware.security import SecurityMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    _CSP = (
        "default-src 'none'; "
        "frame-ancestors 'none'; "
        "base-uri 'none'; "
        "form-action 'none'"
    )

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # camera/microphone scoped to our own origin (self) so WebRTC calls work
        # on explicit user action; a blanket () would silently break the call feature.
        # geolocation/payment/usb fully disabled — the app never uses them.
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(self), camera=(self), payment=(), usb=()"
        )
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = self._CSP
        # HSTS is set by nginx (TLS terminator) — not duplicated here.
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    client = get_client()
    await client.aclose()


app = FastAPI(title=settings.service_name, version="0.1.0", lifespan=lifespan)
setup_observability(app, settings.service_name)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SecurityMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
# Local routers must be registered BEFORE the catch-all proxy so their paths
# (e.g. /api/v1/security/...) are not swallowed by the `/{service}/{path}` proxy.
app.include_router(security_telemetry_router, prefix="/api/v1")
app.include_router(admin_flags_router, prefix="/api/v1")
app.include_router(proxy_router, prefix="/api/v1")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.service_name)
