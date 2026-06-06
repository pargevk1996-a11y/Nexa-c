"""Parse API error payloads (auth vs default FastAPI shape)."""

from __future__ import annotations

from typing import Any


def api_error(response_json: dict[str, Any]) -> dict[str, Any]:
    if "error" in response_json:
        err = response_json["error"]
        return err if isinstance(err, dict) else {"code": "UNKNOWN", "message": str(err)}
    detail = response_json.get("detail")
    if isinstance(detail, dict) and "error" in detail:
        return detail["error"]
    if isinstance(detail, list):
        return {"code": "VALIDATION_ERROR", "message": str(detail)}
    if isinstance(detail, str):
        return {"code": "HTTP_ERROR", "message": detail}
    return {"code": "UNKNOWN", "message": str(response_json)}
