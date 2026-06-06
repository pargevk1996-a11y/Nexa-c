"""NATS JetStream consumer for ws-gateway.

Subscribes to the CHAT stream (subject `chat.>`) using a durable push-consumer
per node. Each ws-gateway node gets its own consumer so every node receives
every message — correct for fan-out to locally connected WebSocket clients.

Falls back silently when NATS_URL is not configured.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)

_nc: Any | None = None  # nats.aio.client.Client
_task: asyncio.Task | None = None

STREAM_NAME = "CHAT"


async def start_nats_consumer(
    nats_url: str,
    node_id: str,
    on_event: Callable[[str, str, dict[str, Any]], Awaitable[None]],
) -> None:
    """Connect to NATS and start consuming the CHAT stream.

    Args:
        nats_url: NATS server URL.
        node_id: Unique id for this ws-gateway node (used as consumer durable name).
        on_event: Coroutine called with (event_name, conversation_id, payload).
    """
    global _nc, _task
    if not nats_url:
        return
    try:
        import nats
        from nats.js.api import ConsumerConfig, DeliverPolicy, AckPolicy

        _nc = await nats.connect(nats_url)
        js = _nc.jetstream()

        consumer_name = f"ws-gateway-{node_id}"

        # Push-based subscriber: each message delivered to this node's inbox
        sub = await js.subscribe(
            "chat.>",
            stream=STREAM_NAME,
            durable=consumer_name,
            config=ConsumerConfig(
                durable_name=consumer_name,
                deliver_policy=DeliverPolicy.NEW,
                ack_policy=AckPolicy.EXPLICIT,
                filter_subject="chat.>",
            ),
        )
        logger.info("NATS consumer '%s' subscribed to %s stream", consumer_name, STREAM_NAME)
        _task = asyncio.create_task(_consume_loop(sub, on_event))
    except Exception:
        logger.warning("NATS consumer start failed — JetStream delivery disabled", exc_info=True)
        _nc = None


async def _consume_loop(sub: Any, on_event: Callable) -> None:
    try:
        async for msg in sub.messages:
            try:
                data = json.loads(msg.data.decode())
                event_name = data.get("event", "")
                conv_id = data.get("conversation_id", "")
                payload = data.get("payload", {})
                await on_event(event_name, conv_id, payload)
                await msg.ack()
            except Exception:
                logger.exception("NATS message processing failed")
                await msg.nak()
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("NATS consumer loop error")


async def stop_nats_consumer() -> None:
    global _nc, _task
    if _task:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    if _nc:
        try:
            await _nc.drain()
        except Exception:
            pass
    _nc = None
    _task = None
