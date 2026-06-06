"""WebSocket frame and realtime event schemas (Nexa protocol v1)."""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Literal
from uuid import uuid4

FrameType = Literal["event", "ack", "rpc", "error"]


@dataclass
class WsFrame:
    type: FrameType
    name: str
    payload: dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid4()))
    ts: int = field(default_factory=lambda: int(time.time() * 1000))

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "id": self.id,
            "name": self.name,
            "payload": self.payload,
            "ts": self.ts,
        }


def ws_frame_to_json(frame: WsFrame) -> str:
    return json.dumps(frame.to_dict(), separators=(",", ":"))


def parse_ws_frame(raw: str) -> WsFrame:
    data = json.loads(raw)
    return WsFrame(
        type=data["type"],
        name=data["name"],
        payload=data.get("payload") or {},
        id=data.get("id") or str(uuid4()),
        ts=data.get("ts") or int(time.time() * 1000),
    )


@dataclass
class RealtimeEvent:
    """Internal bus event (Redis pub/sub payload)."""

    name: str
    target_user_ids: list[str]
    payload: dict[str, Any]
    conversation_id: str | None = None
    source_node_id: str | None = None

    def to_json(self) -> str:
        return json.dumps(asdict(self), separators=(",", ":"))

    @classmethod
    def from_json(cls, raw: str) -> RealtimeEvent:
        data = json.loads(raw)
        return cls(
            name=data["name"],
            target_user_ids=data.get("target_user_ids") or [],
            payload=data.get("payload") or {},
            conversation_id=data.get("conversation_id"),
            source_node_id=data.get("source_node_id"),
        )
