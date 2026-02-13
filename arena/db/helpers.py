"""Database helper utilities."""

import json
from typing import Any, Dict, Optional

import httpx


def _looks_like_unique_violation(resp: httpx.Response) -> bool:
    """Best-effort detect Postgres unique violation (23505) from PostgREST response."""
    if resp.status_code not in (400, 409):
        return False
    text = (resp.text or "").lower()
    return (
        "23505" in text
        or "duplicate key" in text
        or "unique constraint" in text
        or "unique_violation" in text
        or "unique_vote_turn" in text
        or "votes_session_id" in text
    )


def _maybe_json_obj(value: Any) -> Optional[Dict[str, Any]]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
    return None
