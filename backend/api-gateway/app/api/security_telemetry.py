"""Security telemetry API.

Endpoints:
    POST /security/capture-attempt — record a best-effort screen-capture attempt
                                     detected by the web client.
    POST /security/csp-report      — receive CSP violation reports from the browser
                                     (Content-Security-Policy report-uri / report-to).

Both are pure, fire-and-forget telemetry: lightweight structured log lines,
no DB writes, tolerant of unauthenticated calls.

Field lengths are bounded to keep log lines bounded and prevent abuse.
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

logger = logging.getLogger("nexa.security.capture")
csp_logger = logging.getLogger("nexa.security.csp")

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


@router.post("/csp-report", status_code=204)
async def report_csp_violation(request: Request) -> Response:
    """Receive CSP violation reports from the browser.

    Handles both legacy report-uri format (application/csp-report, a JSON object
    with a "csp-report" key) and the newer Reporting API v1 format
    (application/reports+json, a JSON array of report objects).
    """
    try:
        body = await request.json()
    except Exception:
        return Response(status_code=204)

    violations: list[dict] = []
    if isinstance(body, list):
        # Reporting API v1: [{"type": "csp-violation", "body": {...}}, ...]
        violations = [
            item.get("body", {})
            for item in body
            if isinstance(item, dict) and item.get("type") == "csp-violation"
        ]
    elif isinstance(body, dict) and "csp-report" in body:
        # CSP Level 2: {"csp-report": {...}}
        violations = [body["csp-report"]]

    ip = _client_ip(request)
    for v in violations[:5]:  # cap per-request to bound log volume
        blocked = str(v.get("blocked-uri", v.get("blockedURL", "")))[:256]
        directive = str(v.get("violated-directive", v.get("effectiveDirective", "")))[:64]
        doc = str(v.get("document-uri", v.get("documentURL", "")))[:256]
        csp_logger.warning(
            "csp-violation blocked=%s directive=%s document=%s ip=%s",
            blocked,
            directive,
            doc,
            ip,
        )

    return Response(status_code=204)
