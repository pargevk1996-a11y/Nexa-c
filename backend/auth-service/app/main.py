from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from app.api.auth_routes import router as auth_router
from app.api.oauth_routes import router as oauth_router
from app.api.security_routes import router as security_router
from app.api.session_routes import router as session_router
from app.api.routes import router
from app.core.config import settings
from nexa_shared.observability import setup_observability
from nexa_shared.schemas.common import HealthResponse


def _auto_generate_rs256_keys() -> None:
    """Generate an ephemeral RSA-2048 key pair when no keys are configured."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    from app.services.token_service import set_auto_keys

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    set_auto_keys(private_pem, public_pem)


async def _init_postgres() -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.repository import PostgresSessionStore, PostgresUserStore, PostgresVerificationStore
    from app.services.session_store import session_store
    from app.services.user_store import store
    from app.services.verification_store import verification_store

    engine = create_async_engine(settings.database_url, pool_size=10, max_overflow=20, pool_pre_ping=True)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    store._switch_to_postgres(PostgresUserStore(sm))
    session_store._switch_to_postgres(PostgresSessionStore(sm))
    verification_store._switch_to_postgres(PostgresVerificationStore(sm))


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.jwt_algorithm == "RS256" and not (
        settings.jwt_access_private_key or settings.jwt_access_private_key_file
    ):
        _auto_generate_rs256_keys()
    if settings.database_url:
        await _init_postgres()
    yield


app = FastAPI(title=settings.service_name, version="0.1.0", lifespan=lifespan)
setup_observability(app, settings.service_name)
app.include_router(router)
app.include_router(auth_router)
app.include_router(oauth_router)
app.include_router(session_router)
app.include_router(security_router)


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
