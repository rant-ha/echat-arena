"""Admin statistics route."""

from datetime import datetime, timedelta
from typing import Any, Dict

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
                    except:
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
                    except:
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
