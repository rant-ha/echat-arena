"""Rankings database operations via PostgREST."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

import httpx

from arena.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, REQUEST_TIMEOUT
from arena.utils import log_error


def _headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


async def _upsert_strategy_ranking(
    client: httpx.AsyncClient,
    strategy_name: str,
    rating: float,
    uncertainty: float,
    wins: int,
    losses: int,
    ties: int,
    total_battles: int,
) -> bool:
    """Upsert a strategy ranking via PostgREST."""
    try:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/strategy_rankings?on_conflict=strategy_name",
            headers={**_headers(), "Prefer": "resolution=merge-duplicates"},
            json={
                "strategy_name": strategy_name,
                "rating": rating,
                "uncertainty": uncertainty,
                "wins": wins,
                "losses": losses,
                "ties": ties,
                "total_battles": total_battles,
                "computed_at": datetime.utcnow().isoformat() + "Z",
                "updated_at": datetime.utcnow().isoformat() + "Z",
            },
            timeout=REQUEST_TIMEOUT,
        )
        return resp.status_code < 400
    except Exception as exc:
        log_error("upsert_strategy_ranking_error", {"strategy": strategy_name}, exc)
        return False


async def _upsert_ranking_history(
    client: httpx.AsyncClient,
    strategy_name: str,
    snapshot_date: date,
    rating: float,
    uncertainty: float,
    wins: int,
    losses: int,
    ties: int,
    total_battles: int,
) -> bool:
    """Upsert a daily ranking snapshot (handles UNIQUE constraint)."""
    try:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/ranking_history?on_conflict=strategy_name,snapshot_date",
            headers={**_headers(), "Prefer": "resolution=merge-duplicates"},
            json={
                "strategy_name": strategy_name,
                "snapshot_date": snapshot_date.isoformat(),
                "rating": rating,
                "uncertainty": uncertainty,
                "wins": wins,
                "losses": losses,
                "ties": ties,
                "total_battles": total_battles,
            },
            timeout=REQUEST_TIMEOUT,
        )
        return resp.status_code < 400
    except Exception as exc:
        log_error("upsert_ranking_history_error", {"strategy": strategy_name}, exc)
        return False


async def _fetch_rankings(
    client: httpx.AsyncClient,
) -> List[Dict[str, Any]]:
    """Fetch all strategy rankings ordered by rating desc."""
    try:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/strategy_rankings",
            params={
                "select": "*",
                "order": "rating.desc",
            },
            headers=_headers(),
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code < 400:
            return resp.json()
        return []
    except Exception as exc:
        log_error("fetch_rankings_error", {}, exc)
        return []


async def _fetch_ranking_history(
    client: httpx.AsyncClient,
    strategy_name: Optional[str] = None,
    days: int = 30,
) -> List[Dict[str, Any]]:
    """Fetch ranking history, optionally filtered by strategy and date range."""
    try:
        from datetime import timedelta
        cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")

        params: Dict[str, str] = {
            "select": "*",
            "snapshot_date": f"gte.{cutoff}",
            "order": "snapshot_date.asc",
        }
        if strategy_name:
            params["strategy_name"] = f"eq.{strategy_name}"

        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/ranking_history",
            params=params,
            headers=_headers(),
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code < 400:
            return resp.json()
        return []
    except Exception as exc:
        log_error("fetch_ranking_history_error", {"strategy": strategy_name}, exc)
        return []
