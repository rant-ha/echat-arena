"""Compensation queue for failed post-vote turn writes."""

import asyncio
import json
import os
import re
import sys
import time
from typing import Any, Callable, Coroutine, Dict, List, Optional

from arena.utils import _utc_now_iso, _json_dumps


def _sanitize_filename(name: str) -> str:
    """Remove any path traversal characters from filename components."""
    return re.sub(r'[^a-zA-Z0-9_\-.]', '', str(name))


class CompensationQueue:
    """In-memory queue with file backup for failed DB writes."""

    def __init__(
        self,
        backup_dir: str = "/tmp/arena_compensation",
        max_age_sec: float = 3600.0,
        max_queue_size: int = 1000,
    ):
        self._queue: List[Dict[str, Any]] = []
        self._backup_dir = backup_dir
        self._max_age_sec = max_age_sec
        self._max_queue_size = max_queue_size
        self._insert_fn: Optional[Callable[..., Coroutine]] = None
        self._metrics_fn: Optional[Callable[[str], None]] = None
        try:
            os.makedirs(self._backup_dir, exist_ok=True)
        except OSError:
            pass

    def set_insert_fn(self, fn: Callable[..., Coroutine]) -> None:
        """Set the insert function used for retrying writes."""
        self._insert_fn = fn

    def set_metrics_fn(self, fn: Callable[[str], None]) -> None:
        """Set a callback for metrics tracking."""
        self._metrics_fn = fn

    @property
    def queue_size(self) -> int:
        return len(self._queue)

    async def enqueue(self, turn_data: Dict[str, Any]) -> None:
        """Add a failed turn to the retry queue."""
        if len(self._queue) >= self._max_queue_size:
            self._queue.pop(0)

        turn_data["enqueued_at"] = time.time()
        self._queue.append(turn_data)
        self._persist_to_file(turn_data)

        if self._metrics_fn:
            self._metrics_fn("compensation_enqueued")

        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "compensation_enqueued",
            "vote_id": turn_data.get("vote_id"),
            "turn_index": turn_data.get("turn_index"),
            "queue_size": len(self._queue),
        }))

    def _persist_to_file(self, turn_data: Dict[str, Any]) -> None:
        """Persist a single turn to backup directory."""
        try:
            vote_id = _sanitize_filename(turn_data.get('vote_id', 'unknown'))
            turn_index = _sanitize_filename(str(turn_data.get('turn_index', 0)))
            filename = f"{vote_id}_{turn_index}_{int(time.time())}.json"
            filepath = os.path.join(self._backup_dir, filename)
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(turn_data, f, ensure_ascii=False)
        except OSError:
            pass

    async def process_queue(self) -> int:
        """Process all entries, retrying failed writes. Returns recovered count."""
        if not self._insert_fn or not self._queue:
            return 0

        now = time.time()
        pending = [t for t in self._queue if now - t.get("enqueued_at", 0) < self._max_age_sec]
        expired_count = len(self._queue) - len(pending)
        self._queue = []

        recovered = 0
        still_failed: List[Dict[str, Any]] = []

        for turn_data in pending:
            try:
                status = await self._insert_fn(
                    vote_id=turn_data["vote_id"],
                    winner_side=turn_data["winner_side"],
                    turn_index=turn_data["turn_index"],
                    user_message=turn_data["user_message"],
                    assistant_message=turn_data["assistant_message"],
                    user_id=turn_data.get("user_id"),
                )
                status_str = status.value if hasattr(status, "value") else str(status)
                if status_str in ("ok", "conflict"):
                    recovered += 1
                    if self._metrics_fn:
                        self._metrics_fn("compensation_recovered")
                    self._cleanup_backup(turn_data)
                else:
                    still_failed.append(turn_data)
            except Exception as exc:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "compensation_retry_exception",
                    "vote_id": turn_data.get("vote_id"),
                    "error": str(exc),
                }), file=sys.stderr)
                still_failed.append(turn_data)

        self._queue = still_failed

        if recovered or expired_count:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "compensation_processed",
                "recovered": recovered,
                "expired": expired_count,
                "still_pending": len(self._queue),
            }))

        return recovered

    def _cleanup_backup(self, turn_data: Dict[str, Any]) -> None:
        """Remove backup file after successful recovery."""
        try:
            vote_id = _sanitize_filename(turn_data.get("vote_id", "unknown"))
            turn_index = _sanitize_filename(str(turn_data.get("turn_index", 0)))
            prefix = f"{vote_id}_{turn_index}_"
            for f in os.listdir(self._backup_dir):
                if f.startswith(prefix):
                    os.remove(os.path.join(self._backup_dir, f))
                    break
        except OSError:
            pass

    def load_from_backup(self) -> int:
        """Load persisted entries from backup directory on startup."""
        loaded = 0
        try:
            if not os.path.isdir(self._backup_dir):
                return 0
            for filename in os.listdir(self._backup_dir):
                if not filename.endswith(".json"):
                    continue
                filepath = os.path.join(self._backup_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        entry = json.load(f)
                    if isinstance(entry, dict) and "vote_id" in entry:
                        entry.setdefault("enqueued_at", time.time())
                        self._queue.append(entry)
                        loaded += 1
                except (json.JSONDecodeError, OSError):
                    pass
        except OSError:
            pass

        if loaded:
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "compensation_loaded_from_backup",
                "count": loaded,
            }))
        return loaded


compensation_queue = CompensationQueue()
