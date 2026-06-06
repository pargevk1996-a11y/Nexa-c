"""Unit tests: WebSocket frame and realtime event serialization."""

import json

import pytest
from securechat_shared.realtime.events import RealtimeEvent, WsFrame, parse_ws_frame, ws_frame_to_json

pytestmark = pytest.mark.unit


def test_ws_frame_roundtrip() -> None:
    frame = WsFrame(type="rpc", name="auth", payload={"token": "abc"})
    raw = ws_frame_to_json(frame)
    parsed = parse_ws_frame(raw)
    assert parsed.type == "rpc"
    assert parsed.name == "auth"
    assert parsed.payload["token"] == "abc"
    assert parsed.id == frame.id


def test_realtime_event_json_roundtrip() -> None:
    event = RealtimeEvent(
        name="message.new",
        target_user_ids=["u1", "u2"],
        payload={"id": "m1"},
        conversation_id="c1",
        source_node_id="node-a",
    )
    restored = RealtimeEvent.from_json(event.to_json())
    assert restored.name == event.name
    assert restored.target_user_ids == event.target_user_ids
    assert restored.payload == event.payload
    assert restored.conversation_id == "c1"


def test_parse_ws_frame_requires_fields() -> None:
    with pytest.raises(KeyError):
        parse_ws_frame(json.dumps({"type": "rpc"}))
