"""Unit tests: WebSocket per-connection rate limiter."""

import pytest

pytestmark = pytest.mark.unit


def test_rate_limiter_allows_burst_then_blocks(monkeypatch) -> None:
    from tests.helpers.apps import load_app

    load_app("ws-gateway")
    from app.ws.handler import RateLimiter

    times = [1000.0, 1000.1, 1000.2, 1000.3]
    monkeypatch.setattr("app.ws.handler.time.time", lambda: times.pop(0) if times else 1002.0)

    limiter = RateLimiter(max_per_second=2)
    assert limiter.allow("conn-1")
    assert limiter.allow("conn-1")
    assert not limiter.allow("conn-1")
