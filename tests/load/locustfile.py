"""
Load tests for Nexa API (Locust).

Run against a running stack:
  GATEWAY_HOST=http://127.0.0.1:8000 locust -f tests/load/locustfile.py --headless -u 20 -r 5 -t 60s

Load gate (CI p99 < 150ms):
  make test-load-gate
"""

from __future__ import annotations

import json
import os
import uuid

from locust import HttpUser, between, events, task
from locust.runners import MasterRunner


GATEWAY_HOST = os.environ.get("GATEWAY_HOST", "http://127.0.0.1:8000")
P99_THRESHOLD_MS = int(os.environ.get("LOAD_P99_THRESHOLD_MS", "150"))


class GatewayUser(HttpUser):
    """Authenticated user exercising the chat REST path."""

    host = GATEWAY_HOST
    wait_time = between(0.2, 1.0)

    _access_token: str | None = None
    _conv_id: str | None = None

    def on_start(self) -> None:
        email = f"load_{uuid.uuid4().hex[:8]}@nexa.load"
        password = "L0adT3st!Secure"
        username = f"load_{uuid.uuid4().hex[:8]}"

        # Register (may already exist — ignore 409)
        self.client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "username": username},
            name="POST /auth/register",
        )

        # Login
        resp = self.client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
            name="POST /auth/login",
        )
        if resp.status_code == 200:
            data = resp.json()
            self._access_token = data.get("access_token")

        # Create a DM conversation with self as peer (or use existing)
        if self._access_token:
            resp = self.client.post(
                "/api/v1/chat/conversations",
                json={"type": "group", "title": f"load-test-{uuid.uuid4().hex[:6]}"},
                headers=self._auth_headers(),
                name="POST /chat/conversations",
            )
            if resp.status_code in (200, 201):
                self._conv_id = resp.json().get("id")

    def _auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._access_token}"} if self._access_token else {}

    @task(5)
    def send_message(self) -> None:
        if not self._access_token or not self._conv_id:
            return
        self.client.post(
            f"/api/v1/chat/conversations/{self._conv_id}/messages",
            json={
                "client_msg_id": uuid.uuid4().hex,
                "body": "load test message",
                "content_type": "text",
            },
            headers=self._auth_headers(),
            name="POST /chat/messages",
        )

    @task(3)
    def list_messages(self) -> None:
        if not self._access_token or not self._conv_id:
            return
        self.client.get(
            f"/api/v1/chat/conversations/{self._conv_id}/messages?limit=20",
            headers=self._auth_headers(),
            name="GET /chat/messages",
        )

    @task(2)
    def list_conversations(self) -> None:
        if not self._access_token:
            return
        self.client.get(
            "/api/v1/chat/conversations",
            headers=self._auth_headers(),
            name="GET /chat/conversations",
        )

    @task(1)
    def health(self) -> None:
        self.client.get("/health", name="GET /health")


class WsGatewayUser(HttpUser):
    """Light health probe for the WebSocket gateway."""

    host = os.environ.get("WS_HOST", "http://127.0.0.1:8009")
    wait_time = between(0.5, 2.0)

    @task
    def ws_health(self) -> None:
        self.client.get("/health", name="GET ws /health")


# ---------------------------------------------------------------------------
# p99 gate: fail the run if any endpoint breaches the threshold
# ---------------------------------------------------------------------------

@events.quitting.add_listener
def assert_p99_gate(environment, **_kwargs) -> None:
    """Exit with code 1 if any endpoint's p99 exceeds P99_THRESHOLD_MS."""
    if isinstance(environment.runner, MasterRunner):
        return  # only assert on worker/standalone

    stats = environment.runner.stats if environment.runner else environment.stats
    breaches: list[str] = []

    for entry in stats.entries.values():
        p99 = entry.get_response_time_percentile(0.99)
        if p99 and p99 > P99_THRESHOLD_MS:
            breaches.append(
                f"  {entry.name}: p99={p99:.0f}ms > {P99_THRESHOLD_MS}ms"
            )

    if breaches:
        print(
            f"\n[LOAD GATE FAIL] p99 threshold {P99_THRESHOLD_MS}ms exceeded:\n"
            + "\n".join(breaches)
        )
        environment.process_exit_code = 1
    else:
        print(f"\n[LOAD GATE PASS] All endpoints p99 ≤ {P99_THRESHOLD_MS}ms")
