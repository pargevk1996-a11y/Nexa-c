"""NATS JetStream publisher for chat events.

Publishes to the CHAT stream on subject `chat.<conversation_id>`.
Falls back silently when NATS_URL is not configured (dev / Redis-only mode).

Stream setup (idempotent, created on startup):
  Stream name : CHAT
  Subjects    : chat.>
  Storage     : File (persistent across restarts)
  Max age     : 7 days
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

_nc: Any | None = None  # nats.aio.client.Client
_js: Any | None = None  # JetStream context

STREAM_NAME = "CHAT"
STREAM_SUBJECTS = ["chat.>"]


async def init_nats(nats_url: str) -> None:
    global _nc, _js
    if not nats_url:
        return
    try:
        import nats  # nats-py

        _nc = await nats.connect(nats_url)
        _js = _nc.jetstream()
        await _ensure_stream()
        logger.info("NATS JetStream connected: %s", nats_url)
    except Exception:
        logger.warning("NATS unavailable — JetStream publishing disabled", exc_info=True)
        _nc = None
        _js = None


async def close_nats() -> None:
    global _nc, _js
    if _nc:
        try:
            await _nc.drain()
        except Exception:
            pass
    _nc = None
    _js = None


async def _ensure_stream() -> None:
    if not _js:
        return
    from nats.js.api import StreamConfig, RetentionPolicy, StorageType

    try:
        await _js.find_stream(STREAM_NAME)
    except Exception:
        await _js.add_stream(
            StreamConfig(
                name=STREAM_NAME,
                subjects=STREAM_SUBJECTS,
                retention=RetentionPolicy.LIMITS,
                storage=StorageType.FILE,
                max_age=7 * 24 * 3600,  # 7 days in seconds
            )
        )


async def publish_to_nats(
    *,
    event_name: str,
    conversation_id: str,
    payload: dict[str, Any],
    sender_id: str | None = None,
) -> None:
    if not _js:
        return
    subject = f"chat.{conversation_id}"
    data = json.dumps(
        {
            "event": event_name,
            "conversation_id": conversation_id,
            "sender_id": sender_id,
            "payload": payload,
        }
    ).encode()
    try:
        await _js.publish(subject, data)
    except Exception:
        logger.exception("NATS publish failed for %s", subject)
