"""In-memory SessionStore implementation."""

import asyncio
import sys
import time
from typing import Any, Dict, List, Optional

from arena.config import _SESSION_TTL_SEC, _MAX_SESSIONS
from arena.utils import _utc_now_iso, _json_dumps


class SessionStore:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._sessions: Dict[str, Dict[str, Any]] = {}

    async def put(self, session_id: str, value: Dict[str, Any]) -> None:
        """Store a new session with optional conversation_history and turn_count initialization."""
        async with self._lock:
            # Initialize conversation_history and turn_count if not present
            if "conversation_history" not in value:
                value["conversation_history"] = []
            if "turn_count" not in value:
                value["turn_count"] = 0
            self._sessions[session_id] = value
            await self._gc_locked()

    async def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        async with self._lock:
            item = self._sessions.get(session_id)
            if not item:
                return None
            if time.time() - float(item.get("_ts", 0)) > _SESSION_TTL_SEC:
                self._sessions.pop(session_id, None)
                return None
            return item

    async def update(self, session_id: str, patch: Dict[str, Any]) -> None:
        async with self._lock:
            item = self._sessions.get(session_id)
            if not item:
                return
            item.update(patch)
            item["_ts"] = time.time()
            self._sessions[session_id] = item
            await self._gc_locked()

    async def append_turn(
        self,
        session_id: str,
        user_msg: str,
        reply_a: str,
        reply_b: str,
    ) -> bool:
        """Append a conversation turn to the session's history with optimistic locking (H-01 fix).

        Args:
            session_id: The session identifier
            user_msg: User input text
            reply_a: Reply A (Baseline) complete response
            reply_b: Reply B (Strategy) complete response

        Returns:
            bool: True if successfully appended, False if retry needed
        """
        async with self._lock:
            item = self._sessions.get(session_id)
            if not item:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "append_turn_error",
                    "session": session_id,
                    "reason": "session_not_found"
                }), file=sys.stderr)
                return False

            # Optimistic lock: check version number
            current_version = item.get("version", 0)
            expected_turn = item.get("turn_count", 0) + 1

            # Ensure conversation_history and turn_count are initialized
            if "conversation_history" not in item:
                item["conversation_history"] = []
            if "turn_count" not in item:
                item["turn_count"] = 0

            # Verify turn continuity (data consistency check)
            if len(item["conversation_history"]) != item["turn_count"]:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "append_turn_warning",
                    "session": session_id,
                    "history_length": len(item["conversation_history"]),
                    "turn_count": item["turn_count"],
                    "action": "auto_repair"
                }), file=sys.stderr)
                # Auto-repair: sync turn_count with actual history length
                item["turn_count"] = len(item["conversation_history"])
                expected_turn = item["turn_count"] + 1

            # Create turn record
            turn_record = {
                "turn": expected_turn,
                "user": user_msg,
                "reply_a": reply_a,
                "reply_b": reply_b,
                "timestamp": _utc_now_iso(),
            }

            # Append to history
            item["conversation_history"].append(turn_record)
            item["turn_count"] = expected_turn
            item["version"] = current_version + 1  # Increment version for optimistic lock
            item["_ts"] = time.time()

            self._sessions[session_id] = item
            await self._gc_locked()

            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "append_turn_success",
                "session": session_id,
                "turn": expected_turn,
                "version": item["version"]
            }))

            return True

    async def get_conversation_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Retrieve the complete conversation history for a session.

        Args:
            session_id: The session identifier

        Returns:
            List of conversation turn records, or empty list if session not found
        """
        async with self._lock:
            item = self._sessions.get(session_id)
            if not item:
                return []
            return item.get("conversation_history", [])

    async def get_turn_count(self, session_id: str) -> int:
        """Get the current turn count for a session.

        Args:
            session_id: The session identifier

        Returns:
            Current turn count, or 0 if session not found
        """
        async with self._lock:
            item = self._sessions.get(session_id)
            if not item:
                return 0
            return item.get("turn_count", 0)

    async def _build_side_context(self, session_data: Dict[str, Any], side: str) -> List[Dict[str, str]]:
        """Build single-side context for a model."""
        if side not in ('left', 'right'):
            raise ValueError(f"Invalid side: {side}")
        side_data = session_data.get(side, {})
        context = side_data.get('context', [])
        if not isinstance(context, list):
            context = []
        return context

    async def _gc_locked(self) -> None:
        # TTL
        now = time.time()
        expired = [sid for sid, v in self._sessions.items() if now - float(v.get("_ts", 0)) > _SESSION_TTL_SEC]
        for sid in expired:
            self._sessions.pop(sid, None)
        # size cap
        if len(self._sessions) <= _MAX_SESSIONS:
            return
        # drop oldest
        items = sorted(self._sessions.items(), key=lambda kv: float(kv[1].get("_ts", 0)))
        for sid, _ in items[: max(0, len(items) - _MAX_SESSIONS)]:
            self._sessions.pop(sid, None)

    # ------------------------------------------------------------------
    # admin operations (stubs — overridden by persistent stores)
    # ------------------------------------------------------------------

    async def list_sessions(
        self,
        page: int = 1,
        page_size: int = 50,
        include_deleted: bool = False,
    ) -> Dict[str, Any]:
        """Return empty result — memory store does not support session listing."""
        return {
            "success": False,
            "error": "Session listing not supported in memory store",
            "total": 0,
            "page": page,
            "page_size": page_size,
            "sessions": [],
        }

    async def soft_delete(self, session_id: str) -> bool:
        """No-op — memory store does not support soft deletion."""
        return False

    async def restore_session(self, session_id: str) -> bool:
        """No-op — memory store does not support session restore."""
        return False

    async def cleanup_deleted_sessions(self, max_age_days: int = 30) -> int:
        """No-op — memory store does not support cleanup."""
        return 0
