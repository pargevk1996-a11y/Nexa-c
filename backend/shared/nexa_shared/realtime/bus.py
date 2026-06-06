"""Redis pub/sub event bus for distributed realtime fan-out."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from redis.asyncio import Redis

from nexa_shared.realtime.events import RealtimeEvent
from nexa_shared.realtime.registry import ConnectionRegistry

NODE_CHANNEL_PREFIX = "nexa:ws:node:"
RETRY_STREAM = "nexa:mq:retry"


class EventBus:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._pubsub = redis.pubsub()

    def node_channel(self, node_id: str) -> str:
        return f"{NODE_CHANNEL_PREFIX}{node_id}"

    async def publish_to_node(self, node_id: str, event: RealtimeEvent) -> None:
        channel = self.node_channel(node_id)
        await self._redis.publish(channel, event.to_json())

    async def publish_to_users(
        self,
        event: RealtimeEvent,
        *,
        registry_lookup: Callable[[list[str]], Awaitable[dict[str, Any]]],
    ) -> None:
        """Route event to WS nodes that hold target user connections."""
        records = await registry_lookup(event.target_user_ids)
        by_node: dict[str, RealtimeEvent] = {}
        for uid in event.target_user_ids:
            rec = records.get(uid)
            if not rec:
                continue
            node_id = rec.node_id if hasattr(rec, "node_id") else rec["node_id"]
            if node_id not in by_node:
                by_node[node_id] = RealtimeEvent(
                    name=event.name,
                    target_user_ids=[],
                    payload=event.payload,
                    conversation_id=event.conversation_id,
                    source_node_id=event.source_node_id,
                )
            by_node[node_id].target_user_ids.append(uid)
        for node_id, node_event in by_node.items():
            await self.publish_to_node(node_id, node_event)

    async def subscribe_node(
        self,
        node_id: str,
        handler: Callable[[RealtimeEvent], Awaitable[None]],
    ) -> None:
        channel = self.node_channel(node_id)
        await self._pubsub.subscribe(channel)

        async def _listen() -> None:
            while True:
                msg = await self._pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if msg is None:
                    await asyncio.sleep(0.01)
                    continue
                if msg.get("type") != "message":
                    continue
                data = msg.get("data")
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                try:
                    event = RealtimeEvent.from_json(data)
                    await handler(event)
                except Exception:
                    continue

        asyncio.create_task(_listen())

    async def enqueue_retry(self, payload: dict[str, Any], *, max_len: int = 10_000) -> None:
        """Redis stream for failed deliveries / retry worker."""
        await self._redis.xadd(
            RETRY_STREAM,
            {"payload": RealtimeEvent(name="retry", target_user_ids=[], payload=payload).to_json()},
            maxlen=max_len,
            approximate=True,
        )

    async def close(self) -> None:
        await self._pubsub.unsubscribe()
        await self._pubsub.aclose()


async def fanout_event(
    bus: EventBus,
    registry: ConnectionRegistry,
    event: RealtimeEvent,
) -> list[str]:
    """
    Route a realtime event to all WS nodes that hold target connections.
    Returns user_ids with no active WebSocket registration (offline).
    """
    records = await registry.lookup_many(event.target_user_ids)
    online: set[str] = set()
    by_node: dict[str, list[str]] = {}
    for uid, recs in records.items():
        online.add(uid)
        for rec in recs:
            by_node.setdefault(rec.node_id, [])
            if uid not in by_node[rec.node_id]:
                by_node[rec.node_id].append(uid)
    for node_id, uids in by_node.items():
        await bus.publish_to_node(
            node_id,
            RealtimeEvent(
                name=event.name,
                target_user_ids=uids,
                payload=event.payload,
                conversation_id=event.conversation_id,
                source_node_id=event.source_node_id,
            ),
        )
    return [uid for uid in event.target_user_ids if uid not in online]
