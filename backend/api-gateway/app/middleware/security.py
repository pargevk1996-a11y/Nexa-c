"""Gateway security: rate limits, CSRF, request ID."""

from __future__ import annotations

import time
import uuid
from collections import defaultdict

from fastapi import Request, Response
from redis.asyncio import Redis
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from nexa_shared.security.csrf import constant_time_equals, generate_csrf_token
from nexa_shared.security.field_encryption import decrypt_cookie_token
from nexa_shared.security.rate_limit import check_rate_limit

_EXEMPT_CSRF = frozenset(
    {
        "/api/v1/auth/login",
        "/api/v1/auth/login/2fa",
        "/api/v1/auth/register",
        "/api/v1/auth/refresh",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/resend-verification",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/auth/qr/start",
        "/api/v1/auth/webauthn/login/start",
        "/api/v1/auth/webauthn/login/finish",
        "/api/v1/auth/oauth/",
        # Fire-and-forget capture telemetry: sent via navigator.sendBeacon, which
        # cannot attach a CSRF header. Stateless + sessionless (a forged call only
        # writes a log line), so exempting it is safe.
        "/api/v1/security/capture-attempt",
        "/health",
    }
)

_MUTATING = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class _MemoryRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def allow(self, key: str, limit: int, window: int) -> bool:
        now = time.time()
        bucket = self._buckets[key]
        self._buckets[key] = [t for t in bucket if now - t < window]
        if len(self._buckets[key]) >= limit:
            return False
        self._buckets[key].append(now)
        return True


_memory_limiter = _MemoryRateLimiter()
_redis: Redis | None = None


async def _get_redis() -> Redis | None:
    global _redis
    if _redis is not None:
        return _redis
    try:
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
        await _redis.ping()
        return _redis
    except Exception:
        _redis = None
        return None


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id

        ip = _client_ip(request)
        path = request.url.path
        limit_key = f"rl:{ip}:{path.split('?')[0]}"

        redis = await _get_redis()
        allowed = True
        if redis:
            try:
                allowed, _ = await check_rate_limit(redis, limit_key, limit=120, window_seconds=60)
            except Exception:
                allowed = _memory_limiter.allow(limit_key, 120, 60)
        else:
            allowed = _memory_limiter.allow(limit_key, 120, 60)

        if not allowed:
            return Response(
                status_code=429,
                content='{"error":{"code":"RATE_LIMITED","message":"Too many requests"}}',
                media_type="application/json",
                headers={"X-Request-Id": request_id},
            )

        # If the client did not send an Authorization header but has an httpOnly
        # access_token cookie, decrypt the AES-GCM blob back to the JWT and inject
        # Bearer so downstream microservices can verify without any changes.
        if not request.headers.get("authorization") and "access_token" in request.cookies:
            raw = request.cookies["access_token"]
            key = settings.cookie_encryption_key
            jwt = decrypt_cookie_token(raw, key_b64=key) if key else raw
            if jwt:
                MutableHeaders(scope=request.scope)["Authorization"] = f"Bearer {jwt}"

        if request.method in _MUTATING and not any(path.startswith(p) for p in _EXEMPT_CSRF):
            if not settings.csrf_enabled:
                pass
            else:
                cookie = request.cookies.get(settings.csrf_cookie_name)
                header = request.headers.get(settings.csrf_header_name)
                if not cookie or not header or not constant_time_equals(cookie, header):
                    return Response(
                        status_code=403,
                        content='{"error":{"code":"CSRF_FAILED","message":"Invalid CSRF token"}}',
                        media_type="application/json",
                        headers={"X-Request-Id": request_id},
                    )

        response: Response = await call_next(request)
        response.headers["X-Request-Id"] = request_id

        if response.status_code in (200, 201):
            # Endpoints that establish a session must hand out a CSRF cookie.
            issues_session = path in (
                "/api/v1/auth/login",
                "/api/v1/auth/login/2fa",
                "/api/v1/auth/register",
                "/api/v1/auth/oauth/exchange",
                "/api/v1/auth/webauthn/login/finish",
            )
            # Heal sessions that have no CSRF cookie yet (OAuth / QR / WebAuthn /
            # pre-existing logins) the next time the token is refreshed — but do
            # not rotate an already-valid cookie, to avoid a races with in-flight
            # mutating requests.
            heals_missing = (
                path == "/api/v1/auth/refresh"
                and not request.cookies.get(settings.csrf_cookie_name)
            )
            if issues_session or heals_missing:
                token = generate_csrf_token()
                response.set_cookie(
                    key=settings.csrf_cookie_name,
                    value=token,
                    httponly=False,
                    secure=settings.cookie_secure,
                    samesite=settings.cookie_samesite,
                    max_age=settings.jwt_refresh_ttl_seconds,
                    path="/",
                )

        return response
