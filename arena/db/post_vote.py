"""Post-vote chat turn Supabase database operations."""

import asyncio
import sys
from enum import Enum
from typing import Any, Dict, List, Optional

import httpx

from arena.config import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    REQUEST_TIMEOUT,
)
from arena.db.helpers import _looks_like_unique_violation
from arena.db.client import get_supabase_client
from arena.db.circuit_breaker import supabase_breaker
from arena.db.metrics import persistence_metrics
from arena.llm import _http_post_json_with_retries
from arena.utils import log_error


class InsertStatus(str, Enum):
    OK = "ok"
    CONFLICT = "conflict"          # UNIQUE constraint violation → change turn_index
    RETRYABLE = "retryable"        # 5xx, network error, timeout → retry same params
    NON_RETRYABLE = "non_retryable"  # 4xx (non-conflict), config missing → give up


async def _insert_post_vote_turn_supabase(
    vote_id: str,
    winner_side: str,
    turn_index: int,
    user_message: str,
    assistant_message: str,
    user_id: Optional[str] = None,
) -> InsertStatus:
    """Insert a post-vote chat turn into Supabase.

    Returns:
        InsertStatus enum value indicating the result.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("[WARN] SUPABASE_URL or SUPABASE_SERVICE_KEY not set; skip post_vote_turn insert", file=sys.stderr)
        return InsertStatus.NON_RETRYABLE

    if not supabase_breaker.can_execute():
        persistence_metrics.record("circuit_open_count")
        return InsertStatus.RETRYABLE

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
        client = get_supabase_client()
        resp = await _http_post_json_with_retries(client, url, headers, row, timeout=REQUEST_TIMEOUT)
        if resp.status_code >= 500:
            supabase_breaker.record_failure()
            persistence_metrics.record("insert_retryable")
            log_error(
                error_type="post_vote_turn_insert_5xx",
                context={
                    "vote_id": vote_id,
                    "turn_index": turn_index,
                    "status": resp.status_code,
                    "body": (resp.text or "")[:500],
                },
                exc=None,
            )
            return InsertStatus.RETRYABLE
        if resp.status_code >= 400:
            if _looks_like_unique_violation(resp):
                supabase_breaker.record_success()
                persistence_metrics.record("insert_conflict")
                return InsertStatus.CONFLICT
            persistence_metrics.record("insert_non_retryable")
            log_error(
                error_type="post_vote_turn_insert_4xx",
                context={
                    "vote_id": vote_id,
                    "turn_index": turn_index,
                    "status": resp.status_code,
                    "body": (resp.text or "")[:500],
                },
                exc=None,
            )
            return InsertStatus.NON_RETRYABLE
        supabase_breaker.record_success()
        persistence_metrics.record("insert_ok")
        return InsertStatus.OK
    except asyncio.CancelledError:
        raise
    except (httpx.TimeoutException, httpx.ConnectError, httpx.ConnectTimeout, OSError) as exc:
        supabase_breaker.record_failure()
        persistence_metrics.record("insert_retryable")
        log_error(
            error_type="post_vote_turn_insert_network_error",
            context={"vote_id": vote_id, "turn_index": turn_index},
            exc=exc,
        )
        return InsertStatus.RETRYABLE
    except Exception as exc:
        supabase_breaker.record_failure()
        persistence_metrics.record("insert_retryable")
        log_error(
            error_type="post_vote_turn_insert_exception",
            context={"vote_id": vote_id, "turn_index": turn_index},
            exc=exc,
        )
        return InsertStatus.RETRYABLE


async def _fetch_post_vote_turns_supabase(vote_id: str, max_retries: int = 2) -> tuple[List[Dict[str, Any]], Optional[str]]:
    """Fetch all post-vote turns for a given vote_id with retry on transient errors.

    Args:
        vote_id: UUID of the vote record
        max_retries: Number of retry attempts for transient failures

    Returns:
        Tuple of (turns, error_type). On success error_type is None.
        On failure turns is [] and error_type describes the issue.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("[WARN] SUPABASE_URL or SUPABASE_SERVICE_KEY not set; return empty list", file=sys.stderr)
        return [], "config_missing"

    if not supabase_breaker.can_execute():
        persistence_metrics.record("circuit_open_count")
        return [], "circuit_open"

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

    for attempt in range(max_retries + 1):
        try:
            client = get_supabase_client()
            resp = await client.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
            if resp.status_code >= 500 and attempt < max_retries:
                supabase_breaker.record_failure()
                await asyncio.sleep(0.5 * (2 ** attempt))
                continue
            if resp.status_code >= 400:
                supabase_breaker.record_failure()
                persistence_metrics.record("fetch_failed")
                log_error(
                    error_type="post_vote_turns_fetch_failed",
                    context={"vote_id": vote_id, "status": resp.status_code, "attempt": attempt + 1},
                    exc=None
                )
                return [], "db_fetch_failed"
            supabase_breaker.record_success()
            persistence_metrics.record("fetch_ok")
            return resp.json() or [], None
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            supabase_breaker.record_failure()
            if attempt < max_retries:
                await asyncio.sleep(0.5 * (2 ** attempt))
                continue
            persistence_metrics.record("fetch_failed")
            log_error(
                error_type="post_vote_turns_fetch_exception",
                context={"vote_id": vote_id, "attempt": attempt + 1},
                exc=exc
            )
            return [], "db_fetch_exception"

    persistence_metrics.record("fetch_failed")
    return [], "db_fetch_failed"
