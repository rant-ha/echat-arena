"""Post-vote chat turn Supabase database operations."""

import asyncio
import sys
from typing import Any, Dict, List, Optional

import httpx

from arena.config import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    REQUEST_TIMEOUT,
)
from arena.db.helpers import _looks_like_unique_violation
from arena.llm import _http_post_json_with_retries
from arena.utils import log_error


async def _insert_post_vote_turn_supabase(
    vote_id: str,
    winner_side: str,
    turn_index: int,
    user_message: str,
    assistant_message: str,
    user_id: Optional[str] = None,
) -> str:
    """Insert a post-vote chat turn into Supabase.

    Returns:
        "ok" | "conflict" | "error"
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("[WARN] SUPABASE_URL or SUPABASE_SERVICE_KEY not set; skip post_vote_turn insert", file=sys.stderr)
        return "error"

    url = f"{SUPABASE_URL}/rest/v1/post_vote_turns"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    row = {
        "vote_id": vote_id,
        "user_id": user_id,
        "winner_side": winner_side,
        "turn_index": turn_index,
        "user_message": user_message,
        "assistant_message": assistant_message,
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await _http_post_json_with_retries(client, url, headers, row, timeout=REQUEST_TIMEOUT)
            if resp.status_code >= 400:
                # UNIQUE(vote_id, turn_index) conflict under concurrency
                if _looks_like_unique_violation(resp):
                    return "conflict"

                log_error(
                    error_type="post_vote_turn_insert_failed",
                    context={
                        "vote_id": vote_id,
                        "turn_index": turn_index,
                        "status": resp.status_code,
                        "body": (resp.text or "")[:500],
                    },
                    exc=None,
                )
                return "error"
            return "ok"
    except asyncio.CancelledError:
        # Important: allow cancellations (e.g., asyncio.wait_for timeouts) to propagate.
        raise
    except Exception as exc:
        log_error(
            error_type="post_vote_turn_insert_exception",
            context={"vote_id": vote_id, "turn_index": turn_index},
            exc=exc,
        )
        return "error"


async def _fetch_post_vote_turns_supabase(vote_id: str) -> tuple[List[Dict[str, Any]], Optional[str]]:
    """Fetch all post-vote turns for a given vote_id.

    Args:
        vote_id: UUID of the vote record

    Returns:
        Tuple of (turns, error_type). On success error_type is None.
        On failure turns is [] and error_type describes the issue.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("[WARN] SUPABASE_URL or SUPABASE_SERVICE_KEY not set; return empty list", file=sys.stderr)
        return [], "config_missing"

    url = f"{SUPABASE_URL}/rest/v1/post_vote_turns"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
    }

    params = {
        "vote_id": f"eq.{vote_id}",
        "select": "*",
        "order": "turn_index.asc",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
            if resp.status_code >= 400:
                log_error(
                    error_type="post_vote_turns_fetch_failed",
                    context={"vote_id": vote_id, "status": resp.status_code},
                    exc=None
                )
                return [], "db_fetch_failed"
            return resp.json() or [], None
    except asyncio.CancelledError:
        # Important: allow cancellations (e.g., asyncio.wait_for timeouts) to propagate.
        raise
    except Exception as exc:
        log_error(
            error_type="post_vote_turns_fetch_exception",
            context={"vote_id": vote_id},
            exc=exc
        )
        return [], "db_fetch_exception"
