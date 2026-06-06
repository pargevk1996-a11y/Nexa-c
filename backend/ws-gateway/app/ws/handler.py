"""WebSocket protocol handler: auth, subscribe, message.send, presence, typing."""

from __future__ import annotations

import json
import time
from collections import defaultdict
from uuid import uuid4

from fastapi import WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.services.chat_client import ChatClient
from app.ws.connection_manager import ClientConnection, ConnectionManager
from nexa_shared.realtime.events import RealtimeEvent, WsFrame, parse_ws_frame, ws_frame_to_json
from nexa_shared.realtime.registry import ConnectionRegistry
from nexa_shared.security.jwt_keys import load_pem, verify_access_token


class RateLimiter:
    def __init__(self, max_per_second: int) -> None:
        self._max = max_per_second
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def allow(self, conn_id: str) -> bool:
        now = time.time()
        bucket = self._buckets[conn_id]
        self._buckets[conn_id] = [t for t in bucket if now - t < 1.0]
        if len(self._buckets[conn_id]) >= self._max:
            return False
        self._buckets[conn_id].append(now)
        return True


async def _send_frame(ws: WebSocket, frame: WsFrame) -> None:
    await ws.send_text(ws_frame_to_json(frame))


async def _send_error(ws: WebSocket, *, corr_id: str, code: str, message: str) -> None:
    await _send_frame(
        ws,
        WsFrame(type="error", id=corr_id, name=code, payload={"message": message}),
    )


def _extract_token(ws: WebSocket, first_payload: dict | None) -> str | None:
    proto = ws.headers.get("sec-websocket-protocol", "")
    if proto.startswith("bearer,"):
        return proto.split(",", 1)[1].strip()
    if first_payload and first_payload.get("token"):
        return str(first_payload["token"])
    return None


class WsHandler:
    def __init__(
        self,
        *,
        manager: ConnectionManager,
        registry: ConnectionRegistry,
        chat: ChatClient,
        deliver_local,
        publish_event,
    ) -> None:
        self._manager = manager
        self._registry = registry
        self._chat = chat
        self._deliver_local = deliver_local
        self._publish_event = publish_event
        self._rate = RateLimiter(settings.per_conn_rate_per_second)

    async def handle_connection(self, websocket: WebSocket) -> None:
        if self._manager.connection_count >= settings.max_connections_per_node:
            await websocket.close(code=1013, reason="Server at capacity")
            return
        await websocket.accept()
        conn_id = str(uuid4())
        user_id: str | None = None
        access_token: str | None = None

        try:
            raw = await websocket.receive_text()
            if len(raw.encode()) > settings.max_frame_bytes:
                await websocket.close(code=1009)
                return
            frame = parse_ws_frame(raw)
            if frame.name != "auth":
                await _send_error(websocket, corr_id=frame.id, code="AUTH_REQUIRED", message="Send auth first")
                await websocket.close(code=4001)
                return
            token = _extract_token(websocket, frame.payload)
            if not token:
                await _send_error(websocket, corr_id=frame.id, code="AUTH_FAILED", message="Missing token")
                await websocket.close(code=4001)
                return
            try:
                public = load_pem(
                    settings.jwt_access_public_key_file,
                    settings.jwt_access_public_key,
                )
                claims = verify_access_token(
                    token,
                    algorithm=settings.jwt_algorithm,
                    hs_secret=settings.jwt_access_secret or None,
                    public_key_pem=public,
                )
            except Exception:
                await _send_error(websocket, corr_id=frame.id, code="AUTH_FAILED", message="Invalid token")
                await websocket.close(code=4001)
                return
            user_id = str(claims["sub"])
            access_token = token
            conn = ClientConnection(websocket=websocket, user_id=user_id, conn_id=conn_id)
            self._manager.add(conn)
            await self._registry.register(
                user_id,
                node_id=settings.node_id,
                conn_id=conn_id,
                ttl_seconds=settings.heartbeat_interval_seconds * 3,
            )
            await _send_frame(
                websocket,
                WsFrame(
                    type="ack",
                    id=frame.id,
                    name="auth.ok",
                    payload={"user_id": user_id, "node_id": settings.node_id},
                ),
            )

            while True:
                raw = await websocket.receive_text()
                if len(raw.encode()) > settings.max_frame_bytes:
                    await websocket.close(code=1009)
                    break
                if not self._rate.allow(conn_id):
                    await _send_error(websocket, corr_id="", code="RATE_LIMITED", message="Too fast")
                    continue
                frame = parse_ws_frame(raw)
                await self._dispatch(
                    conn,
                    frame,
                    access_token=access_token,
                )
        except WebSocketDisconnect:
            pass
        finally:
            if user_id:
                await self._registry.unregister(
                    user_id,
                    node_id=settings.node_id,
                    conn_id=conn_id,
                )
            self._manager.remove(conn_id)

    async def _dispatch(
        self,
        conn: ClientConnection,
        frame: WsFrame,
        *,
        access_token: str,
    ) -> None:
        ws = conn.websocket
        if frame.name == "ping":
            await self._registry.refresh(conn.user_id, ttl_seconds=settings.heartbeat_interval_seconds * 3)
            await _send_frame(ws, WsFrame(type="ack", id=frame.id, name="pong", payload={}))
            return

        if frame.name == "subscribe":
            conv_ids = frame.payload.get("conversation_ids") or []
            since_seqs: dict = frame.payload.get("since_seqs") or {}
            if isinstance(conv_ids, list):
                str_ids = [str(c) for c in conv_ids]
                self._manager.subscribe(conn.conn_id, str_ids)
                for conv_id in str_ids:
                    last_seq = since_seqs.get(conv_id, 0)
                    if last_seq:
                        try:
                            missed = await self._chat.sync_messages(
                                access_token=access_token,
                                conversation_id=conv_id,
                                after_seq=int(last_seq),
                                limit=100,
                            )
                            for msg in missed:
                                await _send_frame(
                                    ws,
                                    WsFrame(
                                        type="event",
                                        name="message.new",
                                        payload={"message": msg, "seq": msg.get("seq")},
                                    ),
                                )
                        except Exception:
                            pass
            await _send_frame(ws, WsFrame(type="ack", id=frame.id, name="subscribe.ok", payload={}))
            return

        if frame.name == "unsubscribe":
            conv_ids = frame.payload.get("conversation_ids") or []
            if isinstance(conv_ids, list):
                self._manager.unsubscribe(conn.conn_id, [str(c) for c in conv_ids])
            await _send_frame(ws, WsFrame(type="ack", id=frame.id, name="unsubscribe.ok", payload={}))
            return

        if frame.name == "message.send":
            conv_id = str(frame.payload.get("conversation_id", ""))
            client_msg_id = str(frame.payload.get("client_msg_id") or frame.id)
            body = str(frame.payload.get("body", ""))
            if not conv_id or not body:
                await _send_error(ws, corr_id=frame.id, code="INVALID_PAYLOAD", message="conversation_id and body required")
                return
            try:
                msg = await self._chat.send_message(
                    access_token=access_token,
                    conversation_id=conv_id,
                    client_msg_id=client_msg_id,
                    body=body,
                )
                await _send_frame(
                    ws,
                    WsFrame(
                        type="ack",
                        id=frame.id,
                        name="message.send.ok",
                        payload={"message": msg, "client_msg_id": client_msg_id},
                    ),
                )
            except Exception as e:
                await _send_frame(
                    ws,
                    WsFrame(
                        type="error",
                        id=frame.id,
                        name="message.send.failed",
                        payload={"client_msg_id": client_msg_id, "message": str(e)},
                    ),
                )
            return

        if frame.name == "typing":
            await _send_frame(ws, WsFrame(type="ack", id=frame.id, name="typing.ok", payload={}))
            conv_id = str(frame.payload.get("conversation_id") or "")
            event_name = "typing.start" if frame.payload.get("is_typing", True) else "typing.stop"
            payload = {"conversation_id": conv_id, "user_id": conn.user_id}
            frame_out = ws_frame_to_json(
                WsFrame(type="event", name=event_name, payload=payload),
            )
            for peer in self._manager.connections_subscribed_to(
                conv_id,
                exclude_user_id=conn.user_id,
            ):
                try:
                    await peer.websocket.send_text(frame_out)
                except Exception:
                    self._manager.remove(peer.conn_id)
            return

        if frame.name == "presence.heartbeat":
            await self._registry.refresh(conn.user_id, ttl_seconds=settings.heartbeat_interval_seconds * 3)
            await _send_frame(ws, WsFrame(type="ack", id=frame.id, name="presence.ok", payload={}))
            return

        if frame.name == "call.signal":
            target = str(frame.payload.get("to_user_id", ""))
            if not target:
                await _send_error(ws, corr_id=frame.id, code="INVALID_PAYLOAD", message="to_user_id required")
                return
            event = RealtimeEvent(
                name="call.signal",
                target_user_ids=[target],
                payload={
                    "call_id": frame.payload.get("call_id"),
                    "from_user_id": conn.user_id,
                    "signal_type": frame.payload.get("signal_type"),
                    "sdp": frame.payload.get("sdp"),
                    "candidate": frame.payload.get("candidate"),
                },
            )
            await self._publish_event(event)
            await _send_frame(ws, WsFrame(type="ack", id=frame.id, name="call.signal.ok", payload={}))
            return

        if frame.name == "ack":
            return

        await _send_error(ws, corr_id=frame.id, code="UNKNOWN_EVENT", message=f"Unknown: {frame.name}")
