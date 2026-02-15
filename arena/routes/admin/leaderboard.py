"""Admin leaderboard routes."""

from __future__ import annotations

from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Header

from arena.config import API_PREFIX, SUPABASE_URL, SUPABASE_SERVICE_KEY
from arena.utils import _response, _error, log_error
from arena.routes.admin.auth import _require_admin_token
from arena.routes.admin.stats import _fetch_all_votes
from arena.services.ranking import compute_rankings_from_votes, compute_statistical_significance
from arena.db.rankings import (
    _upsert_strategy_ranking,
    _upsert_ranking_history,
    _fetch_rankings,
)

router = APIRouter()

MAX_VOTES = 50000


@router.get(f"{API_PREFIX}/admin/leaderboard")
async def get_leaderboard(
    period: str = "all",
    admin_token: str = Header(None, alias="admin-token"),
):
    """
    Get strategy leaderboard with rankings and statistical significance.

    Query params:
    - period: 1d, 7d, 30d, all (default: all)
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    VALID_PERIODS = {"1d", "7d", "30d", "all"}
    if period not in VALID_PERIODS:
        return _error(
            f"Invalid period. Must be one of: {', '.join(sorted(VALID_PERIODS))}",
            status=400,
        )

    # Calculate date range
    now = datetime.utcnow()
    params: Dict[str, str] = {}
    if period == "1d":
        params["created_at"] = f"gte.{(now - timedelta(days=1)).isoformat()}"
    elif period == "7d":
        params["created_at"] = f"gte.{(now - timedelta(days=7)).isoformat()}"
    elif period == "30d":
        params["created_at"] = f"gte.{(now - timedelta(days=30)).isoformat()}"

    try:
        async with httpx.AsyncClient() as client:
            votes = await _fetch_all_votes(client, params)

            votes_truncated = len(votes) >= MAX_VOTES

            # Compute rankings
            rankings = compute_rankings_from_votes(votes)

            # Build leaderboard sorted by rating
            leaderboard = []
            for name, data in sorted(
                rankings.items(), key=lambda x: x[1]["rating"], reverse=True
            ):
                total = data["total_battles"]
                wins = data["wins"]
                win_rate = round(wins / total * 100, 1) if total > 0 else 0.0

                leaderboard.append({
                    "strategy_name": name,
                    "rating": data["rating"],
                    "uncertainty": data["uncertainty"],
                    "wins": wins,
                    "losses": data["losses"],
                    "ties": data["ties"],
                    "total_battles": total,
                    "win_rate": win_rate,
                    "computed_at": data.get("computed_at"),
                })

            # Statistical significance (empathy vs baseline)
            emp = rankings.get("empathy", {})
            statistics = compute_statistical_significance(
                emp.get("wins", 0),
                emp.get("losses", 0),
                emp.get("ties", 0),
            )

            return _response({
                "leaderboard": leaderboard,
                "statistics": statistics,
                "total_votes": len(votes),
                "votes_truncated": votes_truncated,
                "period": period,
                "computed_at": datetime.utcnow().isoformat() + "Z",
            })

    except Exception as exc:
        log_error("get_leaderboard_error", {}, exc)
        return _error("Failed to get leaderboard", status=500)


@router.post(f"{API_PREFIX}/admin/rankings/compute")
async def compute_and_persist_rankings(
    admin_token: str = Header(None, alias="admin-token"),
):
    """
    Compute rankings from all votes and persist to database.
    Also creates a daily history snapshot.
    Admin-only, manual trigger.
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        async with httpx.AsyncClient() as client:
            votes = await _fetch_all_votes(client, {})

            # Compute
            rankings = compute_rankings_from_votes(votes)

            # Persist each strategy
            today = date.today()
            persisted = 0
            for name, data in rankings.items():
                ok1 = await _upsert_strategy_ranking(
                    client, name,
                    data["rating"], data["uncertainty"],
                    data["wins"], data["losses"], data["ties"],
                    data["total_battles"],
                )
                ok2 = await _upsert_ranking_history(
                    client, name, today,
                    data["rating"], data["uncertainty"],
                    data["wins"], data["losses"], data["ties"],
                    data["total_battles"],
                )
                if ok1 and ok2:
                    persisted += 1

            return _response({
                "persisted_strategies": persisted,
                "total_strategies": len(rankings),
                "total_votes_processed": len(votes),
                "snapshot_date": today.isoformat(),
                "computed_at": datetime.utcnow().isoformat() + "Z",
            })

    except Exception as exc:
        log_error("compute_rankings_error", {}, exc)
        return _error("Failed to compute rankings", status=500)
