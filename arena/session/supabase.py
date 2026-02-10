"""Supabase-backed SessionStore with soft deletion and CAS concurrency control."""

import asyncio
import sys
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx

from arena.config import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    REQUEST_TIMEOUT,
    _SESSION_TTL_SEC,
    _SESSION_CACHE_TTL_SEC, _SESSION_STORE_MODE, _SESSION_ALLOW_FALLBACK,
)
from arena.session.base import SessionStore
from arena.utils import _utc_now_iso, _json_dumps


class SupabaseSessionStore(SessionStore):
    """Supabase-backed SessionStore with soft deletion and single-side context isolation support."""

    def __init__(self) -> None:
        super().__init__()
        self._supabase_url = SUPABASE_URL
        self._supabase_key = SUPABASE_SERVICE_KEY
        self._request_timeout = float(REQUEST_TIMEOUT)
        self._local_cache = {}  # Simple in-memory cache for hot sessions
        self._cache_ttl = _SESSION_CACHE_TTL_SEC

        # Configuration for session store mode
        self._store_mode = _SESSION_STORE_MODE
        self._allow_fallback = _SESSION_ALLOW_FALLBACK

        print(f"[INFO] SessionStore initialized in {self._store_mode} mode", file=sys.stderr)
        if self._store_mode == "supabase" and not self._supabase_url:
            print("[WARN] Supabase mode enabled but SUPABASE_URL not configured, falling back to memory", file=sys.stderr)
            self._store_mode = "memory"

    def _get_headers(self) -> Dict[str, str]:
        """Get standard Supabase headers."""
        return {
            "apikey": self._supabase_key,
            "Authorization": f"Bearer {self._supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }

    def _is_supabase_available(self) -> bool:
        """Check if Supabase is configured and available."""
        return (self._store_mode == "supabase" and
                self._supabase_url and
                self._supabase_key)

    def _is_expired(self, session_data: Dict[str, Any]) -> bool:
        """Check if session is expired based on expires_at."""
        expires_at_str = session_data.get("expires_at")
        if not expires_at_str:
            return False

        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            return datetime.now(expires_at.tzinfo) >= expires_at
        except (ValueError, TypeError):
            return False

    def _get_cache_key(self, session_id: str) -> str:
        """Get cache key for session."""
        return f"session:{session_id}"

    def _cache_get(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session from local cache."""
        cache_key = self._get_cache_key(session_id)
        cached = self._local_cache.get(cache_key)
        if cached:
            cache_time = cached.get("_cache_time")
            if cache_time and (time.time() - cache_time) < self._cache_ttl:
                return cached.get("session_data")
        return None

    def _cache_set(self, session_id: str, session_data: Dict[str, Any]) -> None:
        """Set session in local cache."""
        cache_key = self._get_cache_key(session_id)
        self._local_cache[cache_key] = {
            "session_data": session_data,
            "_cache_time": time.time()
        }

    def _cache_delete(self, session_id: str) -> None:
        """Delete session from local cache."""
        cache_key = self._get_cache_key(session_id)
        self._local_cache.pop(cache_key, None)

    async def _supabase_get(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session from Supabase."""
        if not self._is_supabase_available():
            return None

        url = f"{self._supabase_url}/rest/v1/arena_sessions?session_id=eq.{session_id}&deleted_at=is.null"
        headers = self._get_headers()

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers, timeout=self._request_timeout)
                if resp.status_code >= 400:
                    print(_json_dumps({
                        "t": _utc_now_iso(),
                        "type": "supabase_get_error",
                        "session_id": session_id,
                        "status": resp.status_code,
                        "error": resp.text
                    }), file=sys.stderr)
                    return None

                data = resp.json()
                if not data:
                    return None

                return data[0]
        except Exception as exc:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "supabase_get_exception",
                "session_id": session_id,
                "error": str(exc)
            }), file=sys.stderr)
            return None

    async def _supabase_cas_update(
        self,
        session_id: str,
        old_version: int,
        new_data: Dict[str, Any],
        create_if_not_exists: bool = False
    ) -> bool:
        """Perform CAS (Compare-And-Swap) update on Supabase.

        Args:
            session_id: Session ID
            old_version: Expected current version
            new_data: New session data to store
            create_if_not_exists: Whether to create if session doesn't exist

        Returns:
            True if update succeeded, False if failed (version mismatch or error)
        """
        if not self._is_supabase_available():
            return False

        # Prepare update data
        update_data = {
            "session_data": new_data,
            "version": old_version + 1,
            "expires_at": (datetime.now() + timedelta(seconds=_SESSION_TTL_SEC)).isoformat(),
            "updated_at": _utc_now_iso()
        }
        # Ensure session_id is present on creation to satisfy NOT NULL PK constraint
        if create_if_not_exists:
            update_data["session_id"] = session_id

        # Build query conditions
        conditions = [f"session_id=eq.{session_id}"]
        if create_if_not_exists:
            # For initial creation, we don't check version
            conditions.append("deleted_at=is.null")
        else:
            # For updates, we check version for CAS
            conditions.append(f"version=eq.{old_version}")
            conditions.append("deleted_at=is.null")

        query = "&".join(conditions)
        url = f"{self._supabase_url}/rest/v1/arena_sessions?{query}"
        headers = self._get_headers()

        try:
            async with httpx.AsyncClient() as client:
                if create_if_not_exists:
                    # Use POST for creation (upsert behavior)
                    resp = await client.post(
                        url,
                        headers=headers,
                        json=update_data,
                        timeout=self._request_timeout
                    )
                else:
                    # Use PATCH for updates
                    resp = await client.patch(
                        url,
                        headers=headers,
                        json=update_data,
                        timeout=self._request_timeout
                    )

                if resp.status_code < 400:
                    return True

                # Log detailed error for debugging
                error_details = {
                    "t": _utc_now_iso(),
                    "type": "supabase_cas_update_error",
                    "session_id": session_id,
                    "old_version": old_version,
                    "new_version": old_version + 1,
                    "status": resp.status_code,
                    "response": resp.text,
                    "method": "POST" if create_if_not_exists else "PATCH"
                }

                # Check for version conflict (common case)
                if resp.status_code == 409 or "version" in (resp.text or "").lower():
                    error_details["reason"] = "version_conflict"

                print(_json_dumps(error_details), file=sys.stderr)
                return False
        except Exception as exc:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "supabase_cas_update_exception",
                "session_id": session_id,
                "old_version": old_version,
                "error": str(exc)
            }), file=sys.stderr)
            return False

    async def _build_side_context(self, session_data: Dict[str, Any], side: str) -> List[Dict[str, str]]:
        """Build single-side context for a model.

        Args:
            session_data: Complete session data
            side: 'left' or 'right'

        Returns:
            List of context messages for the specified side
        """
        if side not in ['left', 'right']:
            raise ValueError(f"Invalid side: {side}")

        side_data = session_data.get(side, {})
        context = side_data.get('context', [])

        # Ensure context is a list
        if not isinstance(context, list):
            context = []

        return context

    async def put(self, session_id: str, value: Dict[str, Any]) -> None:
        """Store a new session with Supabase persistence."""
        # Initialize required fields
        if "conversation_history" not in value:
            value["conversation_history"] = []
        if "turn_count" not in value:
            value["turn_count"] = 0
        if "version" not in value:
            value["version"] = 0

        # Initialize single-side contexts if not present
        if "left" not in value or "context" not in value.get("left", {}):
            if "left" not in value:
                value["left"] = {}
            value["left"]["context"] = []

        if "right" not in value or "context" not in value.get("right", {}):
            if "right" not in value:
                value["right"] = {}
            value["right"]["context"] = []

        # Try Supabase first if available
        if self._is_supabase_available():
            success = await self._supabase_cas_update(session_id, 0, value, create_if_not_exists=True)
            if success:
                # Update local cache
                self._cache_set(session_id, value)
                return
            elif not self._allow_fallback:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "supabase_put_failed_no_fallback",
                    "session_id": session_id
                }), file=sys.stderr)
                return

        # Fallback to memory store
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "session_store_fallback_to_memory",
            "session_id": session_id,
            "reason": "supabase_unavailable" if self._is_supabase_available() else "supabase_not_configured"
        }), file=sys.stderr)

        async with self._lock:
            value["_ts"] = time.time()  # For memory store compatibility
            self._sessions[session_id] = value
            await self._gc_locked()

    async def put_or_update(self, session_id: str, value: Dict[str, Any], max_retries: int = 3) -> bool:
        """
        Smart session write: CAS update if exists, otherwise create new record.

        Used for draft restore scenarios to avoid 409 conflict errors.

        Args:
            session_id: Session ID
            value: Session data
            max_retries: Max retries on version conflict

        Returns:
            bool: True on success, False on failure
        """
        # Ensure required fields
        if "conversation_history" not in value:
            value["conversation_history"] = []
        if "turn_count" not in value:
            value["turn_count"] = 0
        if "version" not in value:
            value["version"] = 0

        # Initialize single-side contexts
        if "left" not in value or "context" not in value.get("left", {}):
            if "left" not in value:
                value["left"] = {}
            value["left"]["context"] = []

        if "right" not in value or "context" not in value.get("right", {}):
            if "right" not in value:
                value["right"] = {}
            value["right"]["context"] = []

        # If Supabase unavailable, write to memory directly
        if not self._is_supabase_available():
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "put_or_update_fallback_to_memory",
                "session_id": session_id,
                "reason": "supabase_not_configured"
            }), file=sys.stderr)
            async with self._lock:
                value["_ts"] = time.time()
                self._sessions[session_id] = value
                await self._gc_locked()
            return True

        for attempt in range(max_retries):
            try:
                # 1. Check if session exists
                existing = await self.get(session_id)

                if existing:
                    # 2a. Session exists -> CAS update
                    current_version = existing.get("version", 0)
                    success = await self._supabase_cas_update(
                        session_id,
                        current_version,
                        value,
                        create_if_not_exists=False
                    )
                    if success:
                        self._cache_set(session_id, value)
                        print(_json_dumps({
                            "t": _utc_now_iso(),
                            "type": "put_or_update_cas_success",
                            "session_id": session_id,
                            "old_version": current_version,
                            "attempt": attempt + 1
                        }))
                        return True
                    else:
                        # CAS failed (version conflict), retry
                        print(_json_dumps({
                            "t": _utc_now_iso(),
                            "type": "put_or_update_cas_conflict",
                            "session_id": session_id,
                            "old_version": current_version,
                            "attempt": attempt + 1
                        }), file=sys.stderr)
                        await asyncio.sleep(0.1 * (attempt + 1))
                        continue
                else:
                    # 2b. Session doesn't exist -> create new record
                    success = await self._supabase_cas_update(
                        session_id,
                        0,
                        value,
                        create_if_not_exists=True
                    )
                    if success:
                        self._cache_set(session_id, value)
                        print(_json_dumps({
                            "t": _utc_now_iso(),
                            "type": "put_or_update_create_success",
                            "session_id": session_id,
                            "attempt": attempt + 1
                        }))
                        return True
                    else:
                        # Create failed (possible concurrent create), retry
                        print(_json_dumps({
                            "t": _utc_now_iso(),
                            "type": "put_or_update_create_conflict",
                            "session_id": session_id,
                            "attempt": attempt + 1
                        }), file=sys.stderr)
                        await asyncio.sleep(0.1 * (attempt + 1))
                        continue

            except Exception as exc:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "put_or_update_exception",
                    "session_id": session_id,
                    "attempt": attempt + 1,
                    "error": str(exc)
                }), file=sys.stderr)
                if attempt == max_retries - 1:
                    break
                await asyncio.sleep(0.1 * (attempt + 1))
                continue

        # All retries failed, fall back to memory
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "put_or_update_all_retries_failed",
            "session_id": session_id,
            "max_retries": max_retries
        }), file=sys.stderr)

        async with self._lock:
            value["_ts"] = time.time()
            self._sessions[session_id] = value
            await self._gc_locked()
        return False

    async def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session with Supabase persistence support."""
        # 1. Try local cache first
        cached = self._cache_get(session_id)
        if cached:
            return cached

        # 2. Try Supabase if available
        if self._is_supabase_available():
            supabase_session = await self._supabase_get(session_id)
            if supabase_session:
                # Check TTL
                if self._is_expired(supabase_session):
                    # Session expired, try to delete it
                    await self._supabase_soft_delete_internal(session_id)
                    return None

                # Update cache and return
                session_data = supabase_session["session_data"]
                self._cache_set(session_id, session_data)
                return session_data

        # 3. Fallback to memory store
        async with self._lock:
            item = self._sessions.get(session_id)
            if not item:
                return None
            if time.time() - float(item.get("_ts", 0)) > _SESSION_TTL_SEC:
                self._sessions.pop(session_id, None)
                return None
            return item

    async def update(self, session_id: str, patch: Dict[str, Any]) -> None:
        """Update session with Supabase persistence support."""
        max_retries = 3

        for attempt in range(max_retries):
            # 1. Get current session
            session = await self.get(session_id)
            if session is None:
                return

            # 2. Apply patch
            new_session_data = {**session, **patch}
            current_version = session.get("version", 0)

            # 3. Try Supabase update if available
            if self._is_supabase_available():
                success = await self._supabase_cas_update(
                    session_id,
                    current_version,
                    new_session_data
                )

                if success:
                    # Update cache
                    self._cache_set(session_id, new_session_data)
                    return
                elif not self._allow_fallback:
                    print(_json_dumps({
                        "t": _utc_now_iso(),
                        "type": "supabase_update_failed_no_fallback",
                        "session_id": session_id,
                        "attempt": attempt + 1
                    }), file=sys.stderr)
                    return

            # 4. Fallback to memory store or retry
            if self._is_supabase_available() and attempt < max_retries - 1:
                # Retry with exponential backoff
                await asyncio.sleep(0.1 * (attempt + 1))
                continue

            # Fallback to memory store
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "session_update_fallback_to_memory",
                "session_id": session_id,
                "attempt": attempt + 1
            }), file=sys.stderr)

            async with self._lock:
                item = self._sessions.get(session_id)
                if item:
                    item.update(patch)
                    item["_ts"] = time.time()
                    item["version"] = current_version + 1
                    self._sessions[session_id] = item
                    await self._gc_locked()
            return

    async def append_turn(
        self,
        session_id: str,
        user_msg: str,
        reply_a: str,
        reply_b: str,
    ) -> bool:
        """Append a conversation turn with single-side context isolation and CAS."""
        max_retries = 3

        for attempt in range(max_retries):
            # 1. Get current session
            session = await self.get(session_id)
            if session is None:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "append_turn_error",
                    "session": session_id,
                    "reason": "session_not_found"
                }), file=sys.stderr)
                return False

            # 2. Build single-side contexts
            current_version = session.get("version", 0)

            # Get current contexts
            left_context = await self._build_side_context(session, 'left')
            right_context = await self._build_side_context(session, 'right')

            # Add user message to both sides
            left_context.append({"role": "user", "content": user_msg})
            right_context.append({"role": "user", "content": user_msg})

            # Add model-specific replies
            if reply_a:
                left_context.append({"role": "assistant", "content": reply_a})
            if reply_b:
                right_context.append({"role": "assistant", "content": reply_b})

            # 3. Prepare new session data
            new_session_data = {
                **session,
                'left': {
                    **session.get('left', {}),
                    'context': left_context
                },
                'right': {
                    **session.get('right', {}),
                    'context': right_context
                },
                'turn_count': session.get('turn_count', 0) + 1,
                'version': current_version + 1
            }

            # 4. Append to complete conversation history
            conversation_history = session.get('conversation_history', [])
            expected_turn = len(conversation_history) + 1

            # Verify turn continuity
            if len(conversation_history) != session.get('turn_count', 0):
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "append_turn_warning",
                    "session": session_id,
                    "history_length": len(conversation_history),
                    "turn_count": session.get('turn_count', 0),
                    "action": "auto_repair"
                }), file=sys.stderr)
                # Auto-repair
                new_session_data['turn_count'] = len(conversation_history)
                expected_turn = len(conversation_history) + 1

            # Create turn record
            turn_record = {
                "turn": expected_turn,
                "user": user_msg,
                "reply_a": reply_a,
                "reply_b": reply_b,
                "timestamp": _utc_now_iso(),
            }

            conversation_history.append(turn_record)
            new_session_data['conversation_history'] = conversation_history

            # 5. Try Supabase update
            if self._is_supabase_available():
                success = await self._supabase_cas_update(
                    session_id,
                    current_version,
                    new_session_data
                )

                if success:
                    # Update cache
                    self._cache_set(session_id, new_session_data)

                    print(_json_dumps({
                        "t": _utc_now_iso(),
                        "type": "append_turn_success",
                        "session": session_id,
                        "turn": expected_turn,
                        "version": new_session_data["version"]
                    }))
                    return True
                elif not self._allow_fallback:
                    print(_json_dumps({
                        "t": _utc_now_iso(),
                        "type": "supabase_append_turn_failed_no_fallback",
                        "session_id": session_id,
                        "attempt": attempt + 1
                    }), file=sys.stderr)
                    return False

            # 6. Retry or fallback
            if self._is_supabase_available() and attempt < max_retries - 1:
                await asyncio.sleep(0.1 * (attempt + 1))
                continue

            # Fallback to memory store
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "append_turn_fallback_to_memory",
                "session_id": session_id,
                "attempt": attempt + 1
            }), file=sys.stderr)

            async with self._lock:
                item = self._sessions.get(session_id)
                if item:
                    # Update with new data
                    item.update(new_session_data)
                    item["_ts"] = time.time()
                    self._sessions[session_id] = item
                    await self._gc_locked()
                    return True

            return False

    async def get_conversation_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Retrieve the complete conversation history for a session."""
        session = await self.get(session_id)
        if session is None:
            return []
        return session.get("conversation_history", [])

    async def get_turn_count(self, session_id: str) -> int:
        """Get the current turn count for a session."""
        session = await self.get(session_id)
        if session is None:
            return 0
        return session.get("turn_count", 0)

    async def _supabase_soft_delete_internal(self, session_id: str) -> bool:
        """Internal method for soft deleting a session in Supabase."""
        if not self._is_supabase_available():
            return False

        url = f"{self._supabase_url}/rest/v1/arena_sessions?session_id=eq.{session_id}&deleted_at=is.null"
        headers = self._get_headers()

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.patch(
                    url,
                    headers=headers,
                    json={"deleted_at": _utc_now_iso()},
                    timeout=self._request_timeout
                )

                if resp.status_code < 400:
                    # Clear cache
                    self._cache_delete(session_id)
                    return True

                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "supabase_soft_delete_error",
                    "session_id": session_id,
                    "status": resp.status_code,
                    "response": resp.text
                }), file=sys.stderr)
                return False
        except Exception as exc:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "supabase_soft_delete_exception",
                "session_id": session_id,
                "error": str(exc)
            }), file=sys.stderr)
            return False

    async def soft_delete(self, session_id: str) -> bool:
        """Soft delete a session - mark as deleted but keep data recoverable."""
        if not self._is_supabase_available():
            return False

        return await self._supabase_soft_delete_internal(session_id)

    async def restore_session(self, session_id: str) -> bool:
        """Restore a soft-deleted session."""
        if not self._is_supabase_available():
            return False

        url = f"{self._supabase_url}/rest/v1/arena_sessions?session_id=eq.{session_id}"
        headers = self._get_headers()

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.patch(
                    url,
                    headers=headers,
                    json={"deleted_at": None},
                    timeout=self._request_timeout
                )

                if resp.status_code < 400:
                    # Clear cache so next get will fetch fresh data
                    self._cache_delete(session_id)
                    return True

                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "supabase_restore_error",
                    "session_id": session_id,
                    "status": resp.status_code,
                    "response": resp.text
                }), file=sys.stderr)
                return False
        except Exception as exc:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "supabase_restore_exception",
                "session_id": session_id,
                "error": str(exc)
            }), file=sys.stderr)
            return False

    async def cleanup_deleted_sessions(self, max_age_days: int = 30) -> int:
        """Clean up sessions that have been soft-deleted for more than max_age_days."""
        if not self._is_supabase_available():
            return 0

        cutoff_date = (datetime.now() - timedelta(days=max_age_days)).isoformat()

        # First, query sessions to delete
        url = f"{self._supabase_url}/rest/v1/arena_sessions?deleted_at=lt.{cutoff_date}"
        headers = self._get_headers()

        try:
            async with httpx.AsyncClient() as client:
                # Get sessions to delete
                resp = await client.get(url, headers=headers, timeout=self._request_timeout)
                if resp.status_code >= 400:
                    print(_json_dumps({
                        "t": _utc_now_iso(),
                        "type": "supabase_cleanup_query_error",
                        "status": resp.status_code,
                        "response": resp.text
                    }), file=sys.stderr)
                    return 0

                sessions = resp.json()
                if not sessions:
                    return 0

                # Extract session IDs
                session_ids = [s["session_id"] for s in sessions]

                # Delete in batches to avoid URL length limits
                batch_size = 50
                deleted_count = 0

                for i in range(0, len(session_ids), batch_size):
                    batch = session_ids[i:i + batch_size]
                    delete_url = f"{self._supabase_url}/rest/v1/arena_sessions?session_id=in.({','.join(batch)})"

                    delete_resp = await client.delete(delete_url, headers=headers, timeout=self._request_timeout)

                    if delete_resp.status_code < 400:
                        deleted_count += len(batch)
                        # Clear cache for deleted sessions
                        for sid in batch:
                            self._cache_delete(sid)
                    else:
                        print(_json_dumps({
                            "t": _utc_now_iso(),
                            "type": "supabase_cleanup_delete_error",
                            "batch": f"{i//batch_size + 1}",
                            "status": delete_resp.status_code,
                            "response": delete_resp.text
                        }), file=sys.stderr)

                return deleted_count
        except Exception as exc:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "supabase_cleanup_exception",
                "error": str(exc)
            }), file=sys.stderr)
            return 0

    async def list_sessions(
        self,
        page: int = 1,
        page_size: int = 50,
        include_deleted: bool = False
    ) -> Dict[str, Any]:
        """List sessions for admin purposes."""
        if not self._is_supabase_available():
            return {
                "success": False,
                "error": "Supabase not available",
                "total": 0,
                "page": page,
                "page_size": page_size,
                "sessions": []
            }

        # Build query
        query_params = {
            "select": "session_id,created_at,updated_at,expires_at,deleted_at,session_data->>turn_count",
            "order": "created_at.desc"
        }

        if not include_deleted:
            query_params["deleted_at"] = "is.null"

        # Get total count first
        count_url = f"{self._supabase_url}/rest/v1/arena_sessions?select=count"
        if not include_deleted:
            count_url += "&deleted_at=is.null"

        # Add pagination
        offset = (page - 1) * page_size
        query_params["limit"] = page_size
        query_params["offset"] = offset

        try:
            async with httpx.AsyncClient() as client:
                headers = self._get_headers()

                # Get total count
                count_resp = await client.get(count_url, headers=headers, timeout=self._request_timeout)
                total_count = 0
                if count_resp.status_code < 400:
                    count_data = count_resp.json()
                    total_count = count_data[0]["count"] if count_data else 0

                # Get sessions
                query_str = "&".join([f"{k}={v}" for k, v in query_params.items()])
                list_url = f"{self._supabase_url}/rest/v1/arena_sessions?{query_str}"

                list_resp = await client.get(list_url, headers=headers, timeout=self._request_timeout)

                if list_resp.status_code >= 400:
                    return {
                        "success": False,
                        "error": f"Failed to fetch sessions: {list_resp.text}",
                        "total": total_count,
                        "page": page,
                        "page_size": page_size,
                        "sessions": []
                    }

                sessions = list_resp.json()

                return {
                    "success": True,
                    "total": total_count,
                    "page": page,
                    "page_size": page_size,
                    "sessions": sessions
                }
        except Exception as exc:
            return {
                "success": False,
                "error": str(exc),
                "total": 0,
                "page": page,
                "page_size": page_size,
                "sessions": []
            }
