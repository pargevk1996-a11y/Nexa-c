"""Redis-backed feature flags with percentage rollout.

Usage:
    from nexa_shared.features import FeatureFlags, is_flag_enabled

    flags = FeatureFlags(redis_client)
    await flags.set("nats_delivery", enabled=True, rollout_pct=100)
    enabled = await is_flag_enabled("nats_delivery")

Flag key format in Redis:
    nexa:flag:<name>  →  JSON {"enabled": bool, "rollout_pct": int, "description": str}

Rollout logic:
    - rollout_pct=0   → always off
    - rollout_pct=100 → always on
    - 0<pct<100       → deterministic per user_id (hash-based) so the same user
                        always gets the same result for a given flag
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import asdict, dataclass
from typing import Any

logger = logging.getLogger(__name__)

REDIS_PREFIX = "nexa:flag:"


@dataclass
class FlagConfig:
    enabled: bool = False
    rollout_pct: int = 0
    description: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "FlagConfig":
        data = json.loads(raw)
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


# Module-level singleton — set via init_flags()
_redis: Any | None = None


def init_flags(redis_client: Any) -> None:
    global _redis
    _redis = redis_client


async def is_flag_enabled(flag: str, user_id: str | None = None) -> bool:
    """Return True if *flag* is enabled for *user_id* (or globally if user_id is None)."""
    if _redis is None:
        return False
    try:
        raw = await _redis.get(f"{REDIS_PREFIX}{flag}")
    except Exception:
        logger.warning("Feature flag lookup failed for '%s'", flag)
        return False
    if raw is None:
        return False
    try:
        cfg = FlagConfig.from_json(raw)
    except Exception:
        return False
    if not cfg.enabled or cfg.rollout_pct == 0:
        return False
    if cfg.rollout_pct >= 100:
        return True
    if user_id is None:
        return False
    bucket = int(hashlib.sha256(f"{flag}:{user_id}".encode()).hexdigest(), 16) % 100
    return bucket < cfg.rollout_pct


class FeatureFlags:
    """High-level API for managing feature flags against a Redis client."""

    def __init__(self, redis_client: Any) -> None:
        self._redis = redis_client
        init_flags(redis_client)

    async def set(
        self,
        flag: str,
        *,
        enabled: bool = True,
        rollout_pct: int = 100,
        description: str = "",
    ) -> None:
        cfg = FlagConfig(enabled=enabled, rollout_pct=rollout_pct, description=description)
        await self._redis.set(f"{REDIS_PREFIX}{flag}", cfg.to_json())

    async def get(self, flag: str) -> FlagConfig | None:
        raw = await self._redis.get(f"{REDIS_PREFIX}{flag}")
        if raw is None:
            return None
        try:
            return FlagConfig.from_json(raw)
        except Exception:
            return None

    async def delete(self, flag: str) -> None:
        await self._redis.delete(f"{REDIS_PREFIX}{flag}")

    async def list_all(self) -> dict[str, FlagConfig]:
        keys = await self._redis.keys(f"{REDIS_PREFIX}*")
        result: dict[str, FlagConfig] = {}
        for key in keys:
            raw = await self._redis.get(key)
            if raw:
                name = key.removeprefix(REDIS_PREFIX)
                try:
                    result[name] = FlagConfig.from_json(raw)
                except Exception:
                    pass
        return result
