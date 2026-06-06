"""Per-user request rate limiting (in-memory)."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

from fastapi import HTTPException

from app.core.config import settings


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[datetime]] = defaultdict(list)

    def check(self, user_id: str) -> None:
        now = datetime.now(UTC)
        bucket = self._hits[user_id]
        bucket[:] = [t for t in bucket if (now - t).total_seconds() < 60]
        if len(bucket) >= settings.ai_rate_limit_per_minute:
            raise HTTPException(
                status_code=429,
                detail={"error": {"code": "AI_RATE_LIMIT", "message": "AI rate limit exceeded"}},
            )
        bucket.append(now)


rate_limiter = RateLimiter()
