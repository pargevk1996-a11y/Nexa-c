from redis.asyncio import Redis


async def check_rate_limit(
    redis: Redis,
    key: str,
    *,
    limit: int,
    window_seconds: int,
) -> tuple[bool, int]:
    """
    Sliding window counter. Returns (allowed, current_count).
  """
    pipe = redis.pipeline()
    pipe.incr(key)
    pipe.expire(key, window_seconds, nx=True)
    results = await pipe.execute()
    count = int(results[0])
    return count <= limit, count
