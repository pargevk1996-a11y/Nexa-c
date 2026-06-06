import httpx
from fastapi import APIRouter, Request, Response
from httpx import ConnectError, HTTPError, TimeoutException

from app.core.config import settings

router = APIRouter()

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


def _error_response(status: int, code: str, message: str) -> Response:
    import json

    body = json.dumps({"error": {"code": code, "message": message}})
    return Response(status_code=status, content=body, media_type="application/json")


@router.api_route(
    "/{service}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(service: str, path: str, request: Request) -> Response:
    upstream_base = settings.upstream_map.get(service)
    if not upstream_base:
        return _error_response(404, "UNKNOWN_SERVICE", f"Unknown service: {service}")

    url = f"{upstream_base}/api/v1/{path}" if path else f"{upstream_base}/api/v1"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length")
    }

    body = await request.body()
    client = get_client()
    try:
        upstream = await client.request(
            request.method,
            url,
            headers=headers,
            content=body if body else None,
        )
    except ConnectError:
        return _error_response(
            502,
            "SERVICE_UNAVAILABLE",
            f"Cannot reach {service} service. Is it running?",
        )
    except TimeoutException:
        return _error_response(504, "GATEWAY_TIMEOUT", "Upstream request timed out")
    except HTTPError:
        return _error_response(502, "UPSTREAM_ERROR", "Upstream request failed")

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers={
            k: v
            for k, v in upstream.headers.items()
            if k.lower() not in ("transfer-encoding", "content-encoding", "content-length")
        },
        media_type=upstream.headers.get("content-type"),
    )
