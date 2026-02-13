"""Redis sliding-window rate limiting."""

import time
from fastapi import Request, HTTPException
from arena.state import get_state


def _get_real_ip(request: Request) -> str:
    """Extract real client IP from X-Forwarded-For (Heroku/Cloudflare reverse proxy)."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def rate_limit(
    request: Request, key_prefix: str, max_requests: int, window_sec: int
):
    """Redis sliding window rate limiter. Degrades gracefully if Redis unavailable."""
    state = get_state()
    redis = getattr(state, "redis", None)
    if redis is None:
        # Check if session_store has a redis attribute (HybridSessionStore)
        store = getattr(state, "session_store", None)
        redis = getattr(store, "_l1", None)
        if redis is not None:
            redis = getattr(redis, "_redis", None)
    if redis is None:
        return  # No Redis — degrade gracefully

    ip = _get_real_ip(request)
    key = f"rl:{key_prefix}:{ip}"
    now = time.time()

    try:
        pipe = redis.pipeline()
        pipe.zremrangebyscore(key, 0, now - window_sec)
        pipe.zadd(key, {f"{now}": now})
        pipe.zcard(key)
        pipe.expire(key, window_sec)
        results = await pipe.execute()

        if results[2] > max_requests:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
    except HTTPException:
        raise
    except Exception:
        pass  # Redis error — degrade gracefully
