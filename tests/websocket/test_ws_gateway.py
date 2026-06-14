"""WebSocket tests: Nexa WS gateway auth and health."""

import json

import pytest
from nexa_shared.realtime.events import WsFrame, ws_frame_to_json
from tests.helpers.jwt_util import make_access_token

pytestmark = pytest.mark.websocket


def test_ws_health(ws_client) -> None:
    resp = ws_client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["service"] == "ws-gateway"


def test_ws_rejects_non_auth_first_frame(ws_client) -> None:
    with ws_client.websocket_connect("/api/v1/ws") as ws:
        ws.send_text(
            ws_frame_to_json(WsFrame(type="rpc", name="ping", payload={}))
        )
        msg = json.loads(ws.receive_text())
        assert msg["type"] == "error"
        assert msg["name"] == "AUTH_REQUIRED"


def test_ws_auth_success(ws_client, test_jwt_secret) -> None:
    token = make_access_token(secret=test_jwt_secret)
    auth_frame = ws_frame_to_json(
        WsFrame(type="rpc", name="auth", payload={"token": token})
    )
    with ws_client.websocket_connect("/api/v1/ws") as ws:
        ws.send_text(auth_frame)
        msg = json.loads(ws.receive_text())
        assert msg["type"] == "ack"
        assert msg["name"] == "auth.ok"


def test_ws_auth_via_subprotocol_header(ws_client, test_jwt_secret) -> None:
    """Variant A: token carried in Sec-WebSocket-Protocol, not in the URL.

    The auth frame payload is intentionally empty — the server must read the
    token from the `bearer, <token>` subprotocol header.
    """
    token = make_access_token(secret=test_jwt_secret)
    auth_frame = ws_frame_to_json(WsFrame(type="rpc", name="auth", payload={}))
    with ws_client.websocket_connect(
        "/api/v1/ws", subprotocols=["bearer", token]
    ) as ws:
        ws.send_text(auth_frame)
        msg = json.loads(ws.receive_text())
        assert msg["type"] == "ack"
        assert msg["name"] == "auth.ok"


def test_ws_invalid_token_returns_error(ws_client) -> None:
    auth_frame = ws_frame_to_json(
        WsFrame(type="rpc", name="auth", payload={"token": "not-a-valid-jwt"})
    )
    with ws_client.websocket_connect("/api/v1/ws") as ws:
        ws.send_text(auth_frame)
        msg = json.loads(ws.receive_text())
        assert msg["type"] == "error"
        assert msg["name"] == "AUTH_FAILED"
