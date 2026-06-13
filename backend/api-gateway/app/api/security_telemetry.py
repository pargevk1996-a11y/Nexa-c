"""Security telemetry API.

Endpoint:
    POST /security/capture-attempt — record a best-effort screen-capture attempt
                                     detected by the web client.

This is pure, fire-and-forget telemetry: the web app cannot truly block
screenshots, so it reports detected attempts here for auditing/alerting. The
endpoint is intentionally lightweight (structured log line, no DB write) and
tolerant of unauthenticated calls — it is sent via `navigator.sendBeacon`,
which cannot attach auth headers reliably.

Field lengths are bounded to keep the log line bounded and prevent abuse.
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

logger = logging.getLogger("nexa.security.capture")

router = APIRouter(prefix="/security", tags=["security-telemetry"])


class CaptureAttempt(BaseModel):
    """A single detected capture attempt reported by the web client."""

    vector: str = Field(default="unknown", max_length=32)
    path: str = Field(default="", max_length=512)
    at: int | None = Field(default=None, ge=0)
    userAgent: str = Field(default="", max_length=512, alias="userAgent")

    model_config = {"populate_by_name": True}


def _client_ip(request: Request) -> str:
    """Real client IP behind the nginx proxy (X-Forwarded-For first hop)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


@router.post("/capture-attempt", status_code=204)
async def report_capture_attempt(
    attempt: CaptureAttempt, request: Request
) -> Response:
    client_ip = _client_ip(request)
    logger.warning(
        "screen-capture attempt vector=%s path=%s ip=%s ua=%s client_ts=%s server_ts=%d",
        attempt.vector,
        attempt.path,
        client_ip,
        attempt.userAgent[:200],
        attempt.at,
        int(time.time() * 1000),
    )
    return Response(status_code=204)
