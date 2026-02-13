"""Redis-backed SessionStore with WATCH/MULTI/EXEC optimistic locking."""

import asyncio
import json
import sys
from typing import Any, Dict, List, Optional

from arena.session.base import SessionStore
from arena.utils import _utc_now_iso, _json_dumps

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None  # type: ignore[assignment]


_KEY_PREFIX = "session:"


class RedisSessionStore(SessionStore):
    """Redis-backed session store.

    * Each session is stored as a single JSON string at key ``session:{session_id}``.
    * Writes use ``WATCH`` / ``MULTI`` / ``EXEC`` for optimistic-lock CAS.
    * All Redis errors are caught so callers see ``None`` / ``False`` and can
      degrade gracefully.
    """

    def __init__(
        self,
        redis_url: str,
        ttl_sec: int = 3600,
        max_connections: int = 20,
    ) -> None:
        super().__init__()
        if aioredis is None:
            raise ImportError(
                "redis[hiredis] package is required for RedisSessionStore. "
                "Install it with: pip install redis[hiredis]"
            )
        self._ttl_sec = ttl_sec
        self._pool = aioredis.ConnectionPool.from_url(
            redis_url,
            max_connections=max_connections,
            decode_responses=True,
        )
        self._redis = aioredis.Redis(connection_pool=self._pool)

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _key(session_id: str) -> str:
        return f"{_KEY_PREFIX}{session_id}"

    @staticmethod
    def _serialize(data: Dict[str, Any]) -> str:
        return json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    @staticmethod
    def _deserialize(raw: str) -> Optional[Dict[str, Any]]:
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return None

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------

    async def put(self, session_id: str, value: Dict[str, Any]) -> None:
        """Store a new session.  Initialises ``conversation_history`` and
        ``turn_count`` when absent."""
        if "conversation_history" not in value:
            value["conversation_history"] = []
        if "turn_count" not in value:
            value["turn_count"] = 0
        if "version" not in value:
            value["version"] = 0

        key = self._key(session_id)
        try:
            await self._redis.set(key, self._serialize(value), ex=self._ttl_sec)
        except Exception as exc:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "redis_put_error",
                "session_id": session_id,
                "error": str(exc),
            }), file=sys.stderr)

    async def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Return session data or ``None`` when the key does not exist or
        Redis is unreachable."""
        key = self._key(session_id)
        try:
            raw = await self._redis.get(key)
            if raw is None:
                return None
            return self._deserialize(raw)
        except Exception as exc:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "redis_get_error",
                "session_id": session_id,
                "error": str(exc),
            }), file=sys.stderr)
            return None

    async def update(self, session_id: str, patch: Dict[str, Any]) -> None:
        """Merge *patch* into the session using WATCH/MULTI/EXEC CAS.

        Retries up to 3 times on ``WatchError`` (concurrent modification).
        """
        key = self._key(session_id)
        max_retries = 3

        for attempt in range(max_retries):
            try:
                async with self._redis.pipeline(transaction=True) as pipe:
                    await pipe.watch(key)

                    raw = await pipe.get(key)
                    if raw is None:
                        await pipe.unwatch()
                        return

                    current = self._deserialize(raw)
                    if current is None:
                        await pipe.unwatch()
                        return

                    current.update(patch)
                    current["version"] = current.get("version", 0) + 1

                    pipe.multi()
                    pipe.set(key, self._serialize(current), ex=self._ttl_sec)
                    await pipe.execute()
                    return  # success
            except aioredis.WatchError:
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.05 * (attempt + 1))
                    continue
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "redis_update_cas_exhausted",
                    "session_id": session_id,
                    "attempts": max_retries,
                }), file=sys.stderr)
            except Exception as exc:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "redis_update_error",
                    "session_id": session_id,
                    "attempt": attempt + 1,
                    "error": str(exc),
                }), file=sys.stderr)
                return

    async def append_turn(
        self,
        session_id: str,
        user_msg: str,
        reply_a: str,
        reply_b: str,
    ) -> bool:
        """Append a conversation turn using WATCH/MULTI/EXEC CAS.

        Returns ``True`` on success, ``False`` when the session is missing,
        CAS retries are exhausted, or Redis is unreachable.
        """
        key = self._key(session_id)
        max_retries = 3

        for attempt in range(max_retries):
            try:
                async with self._redis.pipeline(transaction=True) as pipe:
                    await pipe.watch(key)

                    raw = await pipe.get(key)
                    if raw is None:
                        await pipe.unwatch()
                        print(_json_dumps({
                            "t": _utc_now_iso(),
                            "type": "append_turn_error",
                            "session": session_id,
                            "reason": "session_not_found",
                        }), file=sys.stderr)
                        return False

                    item = self._deserialize(raw)
                    if item is None:
                        await pipe.unwatch()
                        return False

                    # Ensure fields
                    if "conversation_history" not in item:
                        item["conversation_history"] = []
                    if "turn_count" not in item:
                        item["turn_count"] = 0

                    current_version = item.get("version", 0)

                    # Auto-repair turn continuity
                    if len(item["conversation_history"]) != item["turn_count"]:
                        print(_json_dumps({
                            "t": _utc_now_iso(),
                            "type": "append_turn_warning",
                            "session": session_id,
                            "history_length": len(item["conversation_history"]),
                            "turn_count": item["turn_count"],
                            "action": "auto_repair",
                        }), file=sys.stderr)
                        item["turn_count"] = len(item["conversation_history"])

                    expected_turn = item["turn_count"] + 1

                    turn_record = {
                        "turn": expected_turn,
                        "user": user_msg,
                        "reply_a": reply_a,
                        "reply_b": reply_b,
                        "timestamp": _utc_now_iso(),
                    }

                    item["conversation_history"].append(turn_record)
                    item["turn_count"] = expected_turn
                    item["version"] = current_version + 1

                    pipe.multi()
                    pipe.set(key, self._serialize(item), ex=self._ttl_sec)
                    await pipe.execute()

                    print(_json_dumps({
                        "t": _utc_now_iso(),
                        "type": "append_turn_success",
                        "session": session_id,
                        "turn": expected_turn,
                        "version": item["version"],
                    }))
                    return True

            except aioredis.WatchError:
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.05 * (attempt + 1))
                    continue
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "redis_append_turn_cas_exhausted",
                    "session": session_id,
                    "attempts": max_retries,
                }), file=sys.stderr)
                return False
            except Exception as exc:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "redis_append_turn_error",
                    "session": session_id,
                    "attempt": attempt + 1,
                    "error": str(exc),
                }), file=sys.stderr)
                return False

        return False

    async def get_conversation_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Return full conversation history, or ``[]`` on miss / error."""
        session = await self.get(session_id)
        if session is None:
            return []
        return session.get("conversation_history", [])

    async def get_turn_count(self, session_id: str) -> int:
        """Return the current turn count, or ``0`` on miss / error."""
        session = await self.get(session_id)
        if session is None:
            return 0
        return session.get("turn_count", 0)

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        """Gracefully shut down the connection pool."""
        try:
            await self._redis.aclose()
            await self._pool.aclose()
        except Exception as exc:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "redis_close_error",
                "error": str(exc),
            }), file=sys.stderr)
