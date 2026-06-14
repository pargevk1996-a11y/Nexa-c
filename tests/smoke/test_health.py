"""Smoke tests: /health on core FastAPI services (no DB required)."""

from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.smoke
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
SHARED = ROOT / "backend" / "shared"

SERVICE_DIRS = [
    ("auth-service", 8001),
    ("ws-gateway", 8009),
    ("api-gateway", 8000),
    ("user-service", 8002),
    ("contact-service", 8003),
    ("chat-service", 8004),
    ("notification-service", 8008),
    ("presence-service", 8010),
    ("call-service", 8011),
    ("ai-service", 8012),
]


def _load_app(service_dir: str):
    from tests.helpers.apps import load_app

    return load_app(service_dir)


@pytest.mark.parametrize("service_dir,_port", SERVICE_DIRS)
def test_health_ok(service_dir: str, _port: int) -> None:
    app = _load_app(service_dir)
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "ok"
    assert "service" in body
