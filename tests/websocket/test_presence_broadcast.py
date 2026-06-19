"""WebSocket tests: real-time presence fan-out to peers (fix-brief #4).

The gateway must tell a user's peers when that user comes online (on subscribe)
and — the regression that mattered — when their LAST connection drops, so a
contact's sidebar dot flips to offline in real time instead of waiting on the
client-side 30s poll. Presence rides the same conversation-subscription path as
typing, so two clients sharing a conversation observe each other's changes; a
client in an UNRELATED conversation must observe nothing (no presence leak).

If the disconnect ``finally`` block (or the subscribe announce) stops emitting
presence, these tests fail — guarding against a silent regression back to
"peer dot frozen green forever".
"""

import json

import pytest
from nexa_shared.realtime.events import WsFrame, ws_frame_to_json
from tests.helpers.jwt_util import make_access_token

pytestmark = pytest.mark.websocket

SHARED_CONV = "conv-shared-presence"


def _auth_frame(token: str) -> str:
    return ws_frame_to_json(WsFrame(type="rpc", name="auth", payload={"token": token}))


def _subscribe_frame(conv_ids: list[str]) -> str:
    return ws_frame_to_json(
        WsFrame(type="rpc", name="subscribe", payload={"conversation_ids": conv_ids})
    )


def _expect(ws, name: str) -> dict:
    """Read one frame and assert its name (ack ordering is deterministic)."""
    msg = json.loads(ws.receive_text())
    assert msg["name"] == name, f"expected {name}, got {msg['name']}: {msg}"
    return msg


def test_peer_receives_online_then_offline(ws_client, test_jwt_secret) -> None:
    token_b = make_access_token(user_id="user-b", session_id="sid-b", secret=test_jwt_secret)
    token_a = make_access_token(user_id="user-a", session_id="sid-a", secret=test_jwt_secret)

    # Peer B connects first and subscribes to the shared conversation.
    with ws_client.websocket_connect("/api/v1/ws") as ws_b:
        ws_b.send_text(_auth_frame(token_b))
        _expect(ws_b, "auth.ok")
        ws_b.send_text(_subscribe_frame([SHARED_CONV]))
        _expect(ws_b, "subscribe.ok")

        # Subject A connects and subscribes to the same conversation.
        with ws_client.websocket_connect("/api/v1/ws") as ws_a:
            ws_a.send_text(_auth_frame(token_a))
            _expect(ws_a, "auth.ok")
            ws_a.send_text(_subscribe_frame([SHARED_CONV]))

            # A's subscribe announces presence → B must see A come online.
            online = json.loads(ws_b.receive_text())
            assert online["name"] == "presence.update"
            assert online["payload"]["user_id"] == "user-a"
            assert online["payload"]["is_online"] is True

        # A's context exits → its socket closes → finally fans out offline to B.
        offline = json.loads(ws_b.receive_text())
        assert offline["name"] == "presence.update"
        assert offline["payload"]["user_id"] == "user-a"
        assert offline["payload"]["is_online"] is False, (
            "peer must be told the user went offline when their last connection "
            "drops (fix-brief #4: no broadcast = sidebar dot frozen green until "
            "the 30s poll)"
        )


def test_no_presence_to_unrelated_conversation(ws_client, test_jwt_secret) -> None:
    """A peer subscribed to a DIFFERENT conversation must not get the update."""
    token_b = make_access_token(user_id="user-iso-b", session_id="sid-iso-b", secret=test_jwt_secret)
    token_a = make_access_token(user_id="user-iso-a", session_id="sid-iso-a", secret=test_jwt_secret)

    with ws_client.websocket_connect("/api/v1/ws") as ws_b:
        ws_b.send_text(_auth_frame(token_b))
        _expect(ws_b, "auth.ok")
        ws_b.send_text(_subscribe_frame(["conv-unrelated"]))
        _expect(ws_b, "subscribe.ok")

        with ws_client.websocket_connect("/api/v1/ws") as ws_a:
            ws_a.send_text(_auth_frame(token_a))
            _expect(ws_a, "auth.ok")
            ws_a.send_text(_subscribe_frame([SHARED_CONV]))
            _expect(ws_a, "subscribe.ok")
            # Round-trip B: any erroneous presence frame would queue ahead of the
            # pong. B must instead see only its own pong — no leaked presence.
            ws_b.send_text(ws_frame_to_json(WsFrame(type="rpc", name="ping", payload={})))
            _expect(ws_b, "pong")
