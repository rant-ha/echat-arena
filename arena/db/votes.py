"""Vote-related Supabase database operations."""

import asyncio
import random
import sys
from typing import Any, Dict, List, Optional

import httpx

from arena.config import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    REQUEST_TIMEOUT, MAX_RETRIES, BACKOFF_BASE,
)
from arena.db.helpers import _looks_like_unique_violation
from arena.llm import _http_post_json_with_retries
from arena.utils import log_error


async def _fetch_vote_id_by_session_id_supabase(session_id: str) -> Optional[str]:
    """Fetch vote.id by session_id.

    Idempotency strategy:
    - /api/arena/vote may be retried; we treat session_id as the idempotency key.
    - If the row already exists, we must return the existing id.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None

    session_id = (session_id or "").strip()
    if not session_id:
        return None

    url = f"{SUPABASE_URL}/rest/v1/votes"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
    }
    params = {
        "select": "id",
        "session_id": f"eq.{session_id}",
        "limit": "1",
    }

    last_exc: Optional[Exception] = None
    async with httpx.AsyncClient() as client:
        for attempt in range(MAX_RETRIES):
            try:
                resp = await client.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
                last_exc = None
                break
            except asyncio.CancelledError:
                # Important: allow cancellations (e.g., asyncio.wait_for timeouts) to propagate.
                raise
            except Exception as exc:  # pragma: no cover
                last_exc = exc
                await asyncio.sleep(BACKOFF_BASE * (2**attempt) + random.random() * 0.2)
        else:
            raise RuntimeError(f"supabase select failed after retries: {last_exc}")

        if resp.status_code >= 400:
            raise RuntimeError(f"supabase select failed {resp.status_code}: {resp.text}")

        rows = resp.json() or []
        if isinstance(rows, list) and rows:
            vote_id = rows[0].get("id")
            return str(vote_id) if vote_id else None

    return None


async def _insert_vote_supabase(row: Dict[str, Any]) -> Optional[str]:
    """Insert vote into Supabase and return the vote_id (UUID).

    This is designed to be *idempotent* for retries:
    - First read by session_id; if exists, return existing id.
    - Otherwise try insert (Prefer: return=representation).
    - If insert hits unique violation (concurrent insert / retry), read again and return id.

    Returns:
        vote_id (str) if successful, None if Supabase not configured
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("[WARN] SUPABASE_URL or SUPABASE_SERVICE_KEY not set; skip insert", file=sys.stderr)
        return None

    session_id = str(row.get("session_id") or "").strip()
    if not session_id:
        raise RuntimeError("supabase insert failed: missing session_id")

    existing = await _fetch_vote_id_by_session_id_supabase(session_id)
    if existing:
        return existing

    url = f"{SUPABASE_URL}/rest/v1/votes"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    async with httpx.AsyncClient() as client:
        resp = await _http_post_json_with_retries(client, url, headers, row, timeout=REQUEST_TIMEOUT)

        if resp.status_code >= 400:
            # If a concurrent request inserted the row first, a UNIQUE(session_id) violation is expected.
            if _looks_like_unique_violation(resp):
                existing = await _fetch_vote_id_by_session_id_supabase(session_id)
                if existing:
                    return existing
            raise RuntimeError(f"supabase insert failed {resp.status_code}: {resp.text}")

        # Parse response to get vote_id
        try:
            result = resp.json()
            if isinstance(result, list) and len(result) > 0:
                vote_id = result[0].get("id")
                return str(vote_id) if vote_id else None
        except Exception as exc:
            print(f"[WARN] failed to parse vote_id from response: {exc}", file=sys.stderr)

    # Fallback: if response didn't include id, try select again.
    return await _fetch_vote_id_by_session_id_supabase(session_id)


async def _update_vote_supabase(session_id: str, ai_scores: Dict[str, Any]) -> None:
    """Update ai_scores field for a vote record identified by session_id."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("[WARN] SUPABASE_URL or SUPABASE_SERVICE_KEY not set; skip update", file=sys.stderr)
        return

    url = f"{SUPABASE_URL}/rest/v1/votes?session_id=eq.{session_id}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = {"ai_scores": ai_scores}

    async with httpx.AsyncClient() as client:
        resp = await client.patch(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
        if resp.status_code >= 400:
            raise RuntimeError(f"supabase update failed {resp.status_code}: {resp.text}")


async def _fetch_all_votes_from_supabase() -> List[Dict[str, Any]]:
    """Fetch all votes rows via Supabase REST (service role)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL/SUPABASE_SERVICE_KEY not set")

    url = f"{SUPABASE_URL}/rest/v1/votes"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
    }

    out: List[Dict[str, Any]] = []
    limit = 1000
    offset = 0

    async with httpx.AsyncClient() as client:
        while True:
            params = {
                "select": "*",
                "order": "created_at.asc",
                "limit": str(limit),
                "offset": str(offset),
            }
            resp = await client.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
            if resp.status_code >= 400:
                raise RuntimeError(f"supabase select failed {resp.status_code}: {resp.text}")
            rows = resp.json() or []
            if not rows:
                break
            out.extend(rows)
            if len(rows) < limit:
                break
            offset += limit

    return out


async def _patch_vote_supabase(session_id: str, payload: Dict[str, Any]) -> None:
    """Patch arbitrary fields on the votes row identified by session_id."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("[WARN] SUPABASE_URL or SUPABASE_SERVICE_KEY not set; skip patch", file=sys.stderr)
        return

    url = f"{SUPABASE_URL}/rest/v1/votes?session_id=eq.{session_id}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.patch(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
        if resp.status_code >= 400:
            raise RuntimeError(f"supabase patch failed {resp.status_code}: {resp.text}")


async def _fetch_vote_record(vote_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a vote record by vote_id for pre-vote conversation data.

    Args:
        vote_id: UUID of the vote record

    Returns:
        Vote record dict or None if not found
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None

    url = f"{SUPABASE_URL}/rest/v1/votes"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
    }

    params = {
        "id": f"eq.{vote_id}",
        "select": "id,prompt,reply_a,reply_b,conversation_history,model_config,user_vote,model_a,model_b",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
            if resp.status_code >= 400:
                return None
            rows = resp.json()
            return rows[0] if rows else None
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        log_error(
            error_type="vote_record_fetch_exception",
            context={"vote_id": vote_id},
            exc=exc,
        )
        return None
