"""HybridSessionStore: Redis L1 + Supabase L2 write-through cache layer.

Redis acts as a fast read cache (L1). Supabase is the authoritative
persistent store (L2). All writes go through L2 first; L1 is populated
on successful L2 writes or on L1-miss-L2-hit backfill.

Any Redis failure is silently absorbed so that data correctness is never
compromised -- the system degrades to Supabase-only latency at worst.
"""

import sys
from typing import Any, Dict, List, Optional

from arena.session.base import SessionStore
from arena.utils import _utc_now_iso, _json_dumps


class HybridSessionStore(SessionStore):
    """Redis (L1) + Supabase (L2) write-through session store.

    Parameters
    ----------
    redis_store : SessionStore
        Fast volatile cache (L1).
    supabase_store : SessionStore
        Persistent authoritative store (L2).
    """

    def __init__(
        self,
        redis_store: SessionStore,
        supabase_store: SessionStore,
    ) -> None:
        # Skip SessionStore.__init__ -- we do not need the in-memory dict/lock
        # that the base class creates because all operations delegate to the
        # two child stores.
        self._l1 = redis_store
        self._l2 = supabase_store

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _log(event: str, session_id: str, **extra: Any) -> None:
        """Emit a structured JSON log line to stderr."""
        payload: Dict[str, Any] = {
            "t": _utc_now_iso(),
            "type": event,
            "session_id": session_id,
        }
        payload.update(extra)
        print(_json_dumps(payload), file=sys.stderr)

    # ------------------------------------------------------------------
    # read path
    # ------------------------------------------------------------------

    async def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        """L1 hit -> return.  L1 miss -> L2 lookup + backfill L1."""
        # --- L1 lookup (Redis) ---
        try:
            l1_result = await self._l1.get(session_id)
            if l1_result is not None:
                return l1_result
        except Exception as exc:
            self._log(
                "hybrid_l1_get_error",
                session_id,
                error=str(exc),
            )
            # fall through to L2

        # --- L2 lookup (Supabase) ---
        l2_result = await self._l2.get(session_id)
        if l2_result is None:
            return None

        # --- backfill L1 ---
        try:
            await self._l1.put(session_id, l2_result)
        except Exception as exc:
            self._log(
                "hybrid_l1_backfill_error",
                session_id,
                error=str(exc),
            )

        return l2_result

    # ------------------------------------------------------------------
    # write path (write-through: L2 first, then L1)
    # ------------------------------------------------------------------

    async def put(self, session_id: str, value: Dict[str, Any]) -> None:
        """Write-through: persist to L2 first, then populate L1."""
        # L2 write (authoritative)
        await self._l2.put(session_id, value)

        # L1 write (best-effort)
        try:
            await self._l1.put(session_id, value)
        except Exception as exc:
            self._log(
                "hybrid_l1_put_error",
                session_id,
                error=str(exc),
            )

    async def update(self, session_id: str, patch: Dict[str, Any]) -> None:
        """Apply *patch* to L2, then invalidate L1.

        We invalidate rather than patch L1 because the L2 update may
        involve CAS/version logic that changes fields beyond the patch.
        The next ``get`` will backfill L1 from the authoritative L2 state.
        """
        # L2 update (authoritative)
        await self._l2.update(session_id, patch)

        # L1 invalidation -- a lightweight way to keep caches consistent
        # without duplicating L2's CAS merge logic.
        try:
            # Re-read from L2 and overwrite L1 so the cache is warm.
            fresh = await self._l2.get(session_id)
            if fresh is not None:
                await self._l1.put(session_id, fresh)
        except Exception as exc:
            self._log(
                "hybrid_l1_update_error",
                session_id,
                error=str(exc),
            )

    async def append_turn(
        self,
        session_id: str,
        user_msg: str,
        reply_a: str,
        reply_b: str,
    ) -> bool:
        """Append turn to L2 then invalidate L1.

        L1 is invalidated (not updated) because append_turn in the
        Supabase store performs CAS version bumps and context isolation
        that are non-trivial to replicate.  The next ``get`` call will
        automatically backfill L1 from L2.
        """
        # L2 append (authoritative)
        result = await self._l2.append_turn(session_id, user_msg, reply_a, reply_b)

        if result:
            # Invalidate L1 -- next get() will backfill from L2
            try:
                # Overwrite L1 with the fresh L2 state so the cache stays warm
                fresh = await self._l2.get(session_id)
                if fresh is not None:
                    await self._l1.put(session_id, fresh)
            except Exception as exc:
                self._log(
                    "hybrid_l1_append_turn_invalidate_error",
                    session_id,
                    error=str(exc),
                )

        return result

    # ------------------------------------------------------------------
    # derived reads (delegate to self.get which already handles L1/L2)
    # ------------------------------------------------------------------

    async def get_conversation_history(self, session_id: str) -> List[Dict[str, Any]]:
        session = await self.get(session_id)
        if session is None:
            return []
        return session.get("conversation_history", [])

    async def get_turn_count(self, session_id: str) -> int:
        session = await self.get(session_id)
        if session is None:
            return 0
        return session.get("turn_count", 0)

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        """Shut down the L1 (Redis) connection pool.

        L2 (Supabase) uses a shared httpx client managed elsewhere, so
        we do not close it here.
        """
        close_fn = getattr(self._l1, "close", None)
        if close_fn and callable(close_fn):
            try:
                await close_fn()
            except Exception as exc:
                self._log(
                    "hybrid_l1_close_error",
                    session_id="*",
                    error=str(exc),
                )

    # ------------------------------------------------------------------
    # admin operations (delegate to L2 — persistent store)
    # ------------------------------------------------------------------

    async def list_sessions(
        self,
        page: int = 1,
        page_size: int = 50,
        include_deleted: bool = False,
    ) -> Dict[str, Any]:
        """List sessions — admin operation, always hits L2."""
        return await self._l2.list_sessions(
            page=page, page_size=page_size, include_deleted=include_deleted
        )

    async def soft_delete(self, session_id: str) -> bool:
        """Soft-delete a session — admin operation, always hits L2."""
        return await self._l2.soft_delete(session_id)

    async def restore_session(self, session_id: str) -> bool:
        """Restore a soft-deleted session — admin operation, always hits L2."""
        return await self._l2.restore_session(session_id)

    async def cleanup_deleted_sessions(self, max_age_days: int = 30) -> int:
        """Clean up old deleted sessions — admin operation, always hits L2."""
        return await self._l2.cleanup_deleted_sessions(max_age_days)
