"""Admin statistics route."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Header

from arena.config import API_PREFIX, SUPABASE_URL, SUPABASE_SERVICE_KEY
from arena.utils import _response, _error, log_error
from arena.routes.admin.auth import _require_admin_token

router = APIRouter()


@router.get(f"{API_PREFIX}/admin/statistics")
async def get_statistics(
    period: str = "7d",
    admin_token: str = Header(None, alias="admin-token")
):
    """
    Get system statistics.

    Query params:
    - period: Time period - 1d, 7d, 30d, all (default: 7d)

    Headers:
    - admin-token: Admin authentication token
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    VALID_PERIODS = {"1d", "7d", "30d", "all"}
    if period not in VALID_PERIODS:
        return _error(f"Invalid period. Must be one of: {', '.join(sorted(VALID_PERIODS))}", status=400)

    # Calculate date range
    now = datetime.utcnow()
    if period == "1d":
        start_date = now - timedelta(days=1)
    elif period == "7d":
        start_date = now - timedelta(days=7)
    elif period == "30d":
        start_date = now - timedelta(days=30)
    else:
        start_date = None

    try:
        async with httpx.AsyncClient() as client:
            # Get total votes
            votes_params = {
                "select": "id,user_vote,created_at,user_id",
            }
            if start_date:
                votes_params["created_at"] = f"gte.{start_date.isoformat()}"

            votes_resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/votes",
                params=votes_params,
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                timeout=30.0
            )

            votes = votes_resp.json() if votes_resp.status_code == 200 else []

            # Count vote distribution
            vote_distribution = {
                "model_a": 0,
                "model_b": 0,
                "tie": 0,
                "both_bad": 0,
            }
            for vote in votes:
                v = vote.get("user_vote")
                if v in vote_distribution:
                    vote_distribution[v] += 1

            # Get unique users who voted
            unique_users = len(set(v.get("user_id") for v in votes if v.get("user_id")))

            # Get total users from auth
            users_resp = await client.get(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                params={"page": 1, "per_page": 1},
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                timeout=10.0
            )

            total_users = 0
            if users_resp.status_code == 200:
                users_data = users_resp.json()
                total_users = users_data.get("total", 0)

            # Get sessions count
            sessions_params = {
                "select": "session_id",
            }
            if start_date:
                sessions_params["created_at"] = f"gte.{start_date.isoformat()}"

            sessions_resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/arena_sessions",
                params=sessions_params,
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Prefer": "count=exact",
                },
                timeout=10.0
            )

            total_sessions = 0
            if sessions_resp.status_code == 200:
                content_range = sessions_resp.headers.get("content-range", "")
                if "/" in content_range:
                    try:
                        total_sessions = int(content_range.split("/")[1])
                    except (ValueError, IndexError):
                        total_sessions = len(sessions_resp.json())

            # Get enabled models count
            models_resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/model_configs",
                params={
                    "select": "id",
                    "is_enabled": "eq.true",
                    "deleted_at": "is.null",
                },
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Prefer": "count=exact",
                },
                timeout=10.0
            )

            active_models = 0
            if models_resp.status_code == 200:
                content_range = models_resp.headers.get("content-range", "")
                if "/" in content_range:
                    try:
                        active_models = int(content_range.split("/")[1])
                    except (ValueError, IndexError):
                        active_models = len(models_resp.json())

            # Calculate daily activity (last 7 days)
            daily_activity = []
            for i in range(7):
                day = now - timedelta(days=i)
                day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
                day_end = day_start + timedelta(days=1)

                day_votes = [
                    v for v in votes
                    if v.get("created_at") and
                    day_start.isoformat() <= v["created_at"] < day_end.isoformat()
                ]

                daily_activity.append({
                    "date": day_start.strftime("%Y-%m-%d"),
                    "votes": len(day_votes),
                })

            daily_activity.reverse()

            return _response({
                "overview": {
                    "total_votes": len(votes),
                    "total_users": total_users,
                    "active_users": unique_users,
                    "total_sessions": total_sessions,
                    "active_models": active_models,
                },
                "vote_distribution": vote_distribution,
                "daily_activity": daily_activity,
                "period": period,
            })

    except Exception as exc:
        log_error(error_type="get_statistics_error", context={}, exc=exc)
        return _error(f"Failed to get statistics: {str(exc)}", status=500)


async def _fetch_all_votes(
    client: httpx.AsyncClient,
    params: Dict[str, str],
    fields: str = "id,created_at,user_vote,user_id,turn_count,base_model_name,winner_type,prompt",
) -> List[Dict[str, Any]]:
    """Fetch all votes with pagination (PostgREST default limit is 1000)."""
    all_votes: List[Dict[str, Any]] = []
    offset = 0
    batch_size = 1000
    while True:
        p = dict(params)
        p["select"] = fields
        p["offset"] = str(offset)
        p["limit"] = str(batch_size)
        p["order"] = "created_at.desc"

        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/votes",
            params=p,
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
            timeout=30.0,
        )
        if resp.status_code != 200:
            break
        batch = resp.json()
        if not batch:
            break
        all_votes.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size
    return all_votes


@router.get(f"{API_PREFIX}/admin/statistics/detailed")
async def get_detailed_statistics(
    period: str = "7d",
    admin_token: str = Header(None, alias="admin-token"),
):
    """
    Get detailed system statistics with per-model breakdowns.

    Query params:
    - period: Time period - 1d, 7d, 30d, all (default: 7d)

    Headers:
    - admin-token: Admin authentication token
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    VALID_PERIODS = {"1d", "7d", "30d", "all"}
    if period not in VALID_PERIODS:
        return _error(f"Invalid period. Must be one of: {', '.join(sorted(VALID_PERIODS))}", status=400)

    # Calculate date ranges for current and previous period
    now = datetime.utcnow()
    period_days: Optional[int] = None
    if period == "1d":
        period_days = 1
    elif period == "7d":
        period_days = 7
    elif period == "30d":
        period_days = 30

    start_date: Optional[datetime] = None
    prev_start_date: Optional[datetime] = None
    prev_end_date: Optional[datetime] = None
    if period_days is not None:
        start_date = now - timedelta(days=period_days)
        prev_end_date = start_date
        prev_start_date = start_date - timedelta(days=period_days)

    try:
        async with httpx.AsyncClient() as client:
            # --- Fetch current-period votes (all pages) ---
            current_params: Dict[str, str] = {}
            if start_date:
                current_params["created_at"] = f"gte.{start_date.isoformat()}"

            votes = await _fetch_all_votes(client, current_params)

            # --- Fetch previous-period votes for trend comparison ---
            prev_votes: List[Dict[str, Any]] = []
            if prev_start_date and prev_end_date:
                prev_params: Dict[str, str] = {
                    "created_at": f"gte.{prev_start_date.isoformat()}",
                    "and": f"(created_at.lt.{prev_end_date.isoformat()})",
                }
                prev_votes = await _fetch_all_votes(
                    client, prev_params, fields="id,turn_count"
                )

            # ==========================================================
            # 1. Per-Model Performance
            # ==========================================================
            model_map: Dict[str, Dict[str, Any]] = {}
            for v in votes:
                model = v.get("base_model_name") or "unknown"
                if model not in model_map:
                    model_map[model] = {
                        "model": model,
                        "total_battles": 0,
                        "strategy_wins": 0,
                        "total_turn_count": 0,
                        "turn_count_n": 0,
                    }
                entry = model_map[model]
                entry["total_battles"] += 1
                if v.get("winner_type") == "strategy":
                    entry["strategy_wins"] += 1
                tc = v.get("turn_count")
                if tc is not None:
                    entry["total_turn_count"] += tc
                    entry["turn_count_n"] += 1

            model_performance: List[Dict[str, Any]] = []
            for entry in sorted(
                model_map.values(), key=lambda x: x["total_battles"], reverse=True
            ):
                total = entry["total_battles"]
                wins = entry["strategy_wins"]
                avg_tc = (
                    round(entry["total_turn_count"] / entry["turn_count_n"], 2)
                    if entry["turn_count_n"] > 0
                    else 0
                )
                model_performance.append({
                    "model": entry["model"],
                    "total_battles": total,
                    "strategy_wins": wins,
                    "strategy_win_rate": round(wins / total * 100, 1) if total > 0 else 0,
                    "avg_turn_count": avg_tc,
                })

            # ==========================================================
            # 2. Strategy Win Rate Overview
            # ==========================================================
            strategy_count = 0
            baseline_count = 0
            null_count = 0
            for v in votes:
                wt = v.get("winner_type")
                if wt == "strategy":
                    strategy_count += 1
                elif wt == "baseline":
                    baseline_count += 1
                else:
                    null_count += 1

            total_votes = len(votes)
            decided = strategy_count + baseline_count
            strategy_overview = {
                "total_votes": total_votes,
                "strategy_wins": strategy_count,
                "baseline_wins": baseline_count,
                "undecided": null_count,
                "strategy_win_rate": (
                    round(strategy_count / decided * 100, 1) if decided > 0 else 0
                ),
            }

            # ==========================================================
            # 3. Hourly Distribution
            # ==========================================================
            hourly: Dict[int, int] = {h: 0 for h in range(24)}
            for v in votes:
                ca = v.get("created_at")
                if ca:
                    try:
                        # Strip Z suffix to get naive UTC datetime (matches start_date from datetime.utcnow())
                        dt = datetime.fromisoformat(ca.replace("Z", ""))
                        hourly[dt.hour] += 1
                    except (ValueError, AttributeError):
                        pass

            hourly_distribution = [
                {"hour": h, "count": hourly[h]} for h in range(24)
            ]

            # ==========================================================
            # 4. Day of Week Distribution
            # ==========================================================
            dow: Dict[int, int] = {d: 0 for d in range(7)}
            for v in votes:
                ca = v.get("created_at")
                if ca:
                    try:
                        # Strip Z suffix to get naive UTC datetime (matches start_date from datetime.utcnow())
                        dt = datetime.fromisoformat(ca.replace("Z", ""))
                        dow[dt.weekday()] += 1
                    except (ValueError, AttributeError):
                        pass

            day_of_week_distribution = [
                {"day": d, "count": dow[d]} for d in range(7)
            ]

            # ==========================================================
            # 5. User Engagement Funnel
            # ==========================================================
            user_vote_counts: Dict[str, int] = {}
            for v in votes:
                uid = v.get("user_id")
                if uid:
                    user_vote_counts[uid] = user_vote_counts.get(uid, 0) + 1

            user_funnel = {
                "users_1_plus": sum(1 for c in user_vote_counts.values() if c >= 1),
                "users_5_plus": sum(1 for c in user_vote_counts.values() if c >= 5),
                "users_10_plus": sum(1 for c in user_vote_counts.values() if c >= 10),
                "users_20_plus": sum(1 for c in user_vote_counts.values() if c >= 20),
            }

            # ==========================================================
            # 6. Average Session Length (turn_count) + Trend
            # ==========================================================
            turn_counts = [
                v["turn_count"] for v in votes
                if v.get("turn_count") is not None
            ]
            current_avg = (
                round(sum(turn_counts) / len(turn_counts), 2)
                if turn_counts
                else 0
            )

            prev_turn_counts = [
                v["turn_count"] for v in prev_votes
                if v.get("turn_count") is not None
            ]
            prev_avg = (
                round(sum(prev_turn_counts) / len(prev_turn_counts), 2)
                if prev_turn_counts
                else 0
            )

            if prev_avg > 0:
                trend_pct = round((current_avg - prev_avg) / prev_avg * 100, 1)
            else:
                trend_pct = 0.0

            avg_session_length = {
                "current_avg": current_avg,
                "previous_avg": prev_avg,
                "trend_pct": trend_pct,
                "current_sample": len(turn_counts),
                "previous_sample": len(prev_turn_counts),
            }

            # ==========================================================
            # 7. Top Prompts (first 50 chars)
            # ==========================================================
            prompt_counts: Dict[str, int] = {}
            for v in votes:
                prompt = v.get("prompt")
                if prompt:
                    prefix = prompt[:50].strip()
                    if prefix:
                        prompt_counts[prefix] = prompt_counts.get(prefix, 0) + 1

            top_prompts = sorted(
                [{"prompt_prefix": k, "count": c} for k, c in prompt_counts.items()],
                key=lambda x: x["count"],
                reverse=True,
            )[:10]

            return _response({
                "model_performance": model_performance,
                "strategy_overview": strategy_overview,
                "hourly_distribution": hourly_distribution,
                "day_of_week_distribution": day_of_week_distribution,
                "user_funnel": user_funnel,
                "avg_session_length": avg_session_length,
                "top_prompts": top_prompts,
                "period": period,
            })

    except Exception as exc:
        log_error(error_type="get_detailed_statistics_error", context={}, exc=exc)
        return _error(f"Failed to get detailed statistics: {str(exc)}", status=500)
