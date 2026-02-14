"""Admin user management routes."""

import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Header

from arena.config import API_PREFIX, SUPABASE_URL, SUPABASE_SERVICE_KEY
from arena.utils import _response, _error, log_error
from arena.routes.admin.auth import _require_admin_token

router = APIRouter()

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


@router.get(f"{API_PREFIX}/admin/users")
async def list_users(
    page: int = 1,
    page_size: int = 50,
    search: str = "",
    admin_token: str = Header(None, alias="admin-token")
):
    """
    List all users with vote counts.

    Query params:
    - page: Page number (default 1)
    - page_size: Items per page (default 50)
    - search: Search by email (optional)

    Headers:
    - admin-token: Admin authentication token
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        # Clamp pagination bounds
        page = max(page, 1)
        page_size = min(max(page_size, 1), 200)

        async with httpx.AsyncClient() as client:
            # Note: This requires the Supabase service key with admin access
            url = f"{SUPABASE_URL}/auth/v1/admin/users"
            params = {
                "page": page,
                "per_page": page_size,
            }

            resp = await client.get(
                url,
                params=params,
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                timeout=10.0
            )

            if resp.status_code != 200:
                return _error(f"Failed to fetch users: {resp.text}", status=500)

            data = resp.json()
            users = data.get("users", [])

            # Filter by search if provided
            if search:
                search_lower = search.lower()
                users = [u for u in users if search_lower in (u.get("email") or "").lower()]

            # Get vote counts for each user
            user_ids = [u["id"] for u in users]
            vote_counts = {}

            if user_ids:
                # Validate UUIDs before constructing PostgREST in.() filter
                safe_ids = [uid for uid in user_ids if UUID_RE.match(uid)]
                if not safe_ids:
                    # No valid UUIDs, skip vote count query
                    pass
                else:
                    # Query vote counts
                    votes_resp = await client.get(
                        f"{SUPABASE_URL}/rest/v1/votes",
                        params={
                            "select": "user_id",
                            "user_id": f"in.({','.join(safe_ids)})",
                        },
                        headers={
                            "apikey": SUPABASE_SERVICE_KEY,
                            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        },
                        timeout=10.0
                    )

                    if votes_resp.status_code == 200:
                        votes = votes_resp.json()
                        for vote in votes:
                            uid = vote.get("user_id")
                            if uid:
                                vote_counts[uid] = vote_counts.get(uid, 0) + 1

            # Format response
            formatted_users = []
            for user in users:
                user_meta = user.get("user_metadata", {}) or {}
                formatted_users.append({
                    "id": user.get("id"),
                    "email": user.get("email"),
                    "created_at": user.get("created_at"),
                    "last_sign_in_at": user.get("last_sign_in_at"),
                    "vote_count": vote_counts.get(user.get("id"), 0),
                    "is_disabled": user_meta.get("is_disabled", False),
                })

            return _response({
                "total": data.get("total", len(users)),
                "page": page,
                "page_size": page_size,
                "users": formatted_users
            })

    except Exception as exc:
        log_error(error_type="list_users_error", context={}, exc=exc)
        return _error(f"Failed to list users: {str(exc)}", status=500)


@router.post(f"{API_PREFIX}/admin/users/{{user_id}}/disable")
async def disable_user(
    user_id: str,
    admin_token: str = Header(None, alias="admin-token")
):
    """
    Disable a user by setting user_metadata.is_disabled = true.

    Path params:
    - user_id: UUID of the user
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        async with httpx.AsyncClient() as client:
            # Update user metadata via admin API
            resp = await client.put(
                f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "user_metadata": {"is_disabled": True}
                },
                timeout=10.0
            )

            if resp.status_code != 200:
                return _error(f"Failed to disable user: {resp.text}", status=500)

            return _response({
                "user_id": user_id,
                "is_disabled": True
            })

    except Exception as exc:
        log_error(error_type="disable_user_error", context={"user_id": user_id}, exc=exc)
        return _error(f"Failed to disable user: {str(exc)}", status=500)


@router.post(f"{API_PREFIX}/admin/users/{{user_id}}/enable")
async def enable_user(
    user_id: str,
    admin_token: str = Header(None, alias="admin-token")
):
    """
    Enable a user by setting user_metadata.is_disabled = false.

    Path params:
    - user_id: UUID of the user
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "user_metadata": {"is_disabled": False}
                },
                timeout=10.0
            )

            if resp.status_code != 200:
                return _error(f"Failed to enable user: {resp.text}", status=500)

            return _response({
                "user_id": user_id,
                "is_disabled": False
            })

    except Exception as exc:
        log_error(error_type="enable_user_error", context={"user_id": user_id}, exc=exc)
        return _error(f"Failed to enable user: {str(exc)}", status=500)


@router.get(f"{API_PREFIX}/admin/users/{{user_id}}/votes")
async def get_user_votes(
    user_id: str,
    page: int = 1,
    page_size: int = 20,
    admin_token: str = Header(None, alias="admin-token")
):
    """
    Get vote history for a specific user.

    Path params:
    - user_id: UUID of the user

    Query params:
    - page: Page number (default 1)
    - page_size: Items per page (default 20)
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        offset = (page - 1) * page_size

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/votes",
                params={
                    "select": "id,created_at,prompt,user_vote,turn_count",
                    "user_id": f"eq.{user_id}",
                    "order": "created_at.desc",
                    "offset": str(offset),
                    "limit": str(page_size),
                },
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Prefer": "count=exact",
                },
                timeout=10.0
            )

            if resp.status_code != 200:
                return _error(f"Failed to fetch votes: {resp.text}", status=500)

            votes = resp.json()

            # Get total from header
            content_range = resp.headers.get("content-range", "")
            total = 0
            if "/" in content_range:
                try:
                    total = int(content_range.split("/")[1])
                except (ValueError, IndexError):
                    total = len(votes)

            return _response({
                "total": total,
                "page": page,
                "page_size": page_size,
                "votes": votes
            })

    except Exception as exc:
        log_error(error_type="get_user_votes_error", context={"user_id": user_id}, exc=exc)
        return _error(f"Failed to get user votes: {str(exc)}", status=500)


@router.get(f"{API_PREFIX}/admin/users/{{user_id}}/detail")
async def get_user_detail(
    user_id: str,
    admin_token: str = Header(None, alias="admin-token")
):
    """
    Get detailed user info including stats, conversations, and activity timeline.
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        async with httpx.AsyncClient() as client:
            headers = {
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            }

            # 1. Fetch user profile from Supabase Auth admin API
            profile_resp = await client.get(
                f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers=headers,
                timeout=10.0
            )

            if profile_resp.status_code != 200:
                return _error(f"Failed to fetch user profile: {profile_resp.text}", status=500)

            user_data = profile_resp.json()
            user_meta = user_data.get("user_metadata", {}) or {}
            profile = {
                "id": user_data.get("id"),
                "email": user_data.get("email"),
                "created_at": user_data.get("created_at"),
                "last_sign_in_at": user_data.get("last_sign_in_at"),
                "is_disabled": user_meta.get("is_disabled", False),
            }

            # 2a. Fetch lightweight vote data for stats (up to 1000)
            stats_resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/votes",
                params={
                    "select": "id,created_at,user_vote,turn_count,base_model_name,winner_type",
                    "user_id": f"eq.{user_id}",
                    "order": "created_at.desc",
                    "limit": "1000",
                },
                headers=headers,
                timeout=15.0
            )

            if stats_resp.status_code != 200:
                return _error(f"Failed to fetch user votes: {stats_resp.text}", status=500)

            stats_votes: List[Dict[str, Any]] = stats_resp.json()

            # 2b. Fetch recent conversations with full content (limit 20)
            convos_resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/votes",
                params={
                    "select": "id,created_at,prompt,reply_a,reply_b,user_vote,turn_count,"
                              "base_model_name,conversation_history,model_config",
                    "user_id": f"eq.{user_id}",
                    "order": "created_at.desc",
                    "limit": "20",
                },
                headers=headers,
                timeout=15.0
            )

            if convos_resp.status_code != 200:
                return _error(f"Failed to fetch user conversations: {convos_resp.text}", status=500)

            recent_convos: List[Dict[str, Any]] = convos_resp.json()

            # 3. Calculate stats from lightweight data
            total_votes = len(stats_votes)
            strategy_wins = 0
            baseline_wins = 0
            model_names: List[str] = []
            turn_counts: List[int] = []
            first_activity: Optional[str] = None
            last_activity: Optional[str] = None

            for v in stats_votes:
                wt = v.get("winner_type")
                if wt == "strategy":
                    strategy_wins += 1
                elif wt == "baseline":
                    baseline_wins += 1

                bm = v.get("base_model_name")
                if bm:
                    model_names.append(bm)

                tc = v.get("turn_count")
                if tc is not None:
                    turn_counts.append(tc)

            if stats_votes:
                # stats_votes are ordered desc, so last element is earliest
                last_activity = stats_votes[0].get("created_at")
                first_activity = stats_votes[-1].get("created_at")

            strategy_preference_pct = 0.0
            if total_votes > 0:
                strategy_preference_pct = round(
                    (strategy_wins / total_votes) * 100, 1
                )

            most_used_model: Optional[str] = None
            if model_names:
                counter = Counter(model_names)
                most_used_model = counter.most_common(1)[0][0]

            avg_turns: float = 0.0
            if turn_counts:
                avg_turns = round(sum(turn_counts) / len(turn_counts), 1)

            stats = {
                "total_votes": total_votes,
                "strategy_wins": strategy_wins,
                "baseline_wins": baseline_wins,
                "strategy_preference_pct": strategy_preference_pct,
                "most_used_model": most_used_model,
                "avg_turns_per_session": avg_turns,
                "first_activity": first_activity,
                "last_activity": last_activity,
            }

            # 4. Recent conversations (from full-content query)
            recent_conversations = []
            for v in recent_convos:
                recent_conversations.append({
                    "id": v.get("id"),
                    "created_at": v.get("created_at"),
                    "prompt": v.get("prompt"),
                    "reply_a": v.get("reply_a"),
                    "reply_b": v.get("reply_b"),
                    "user_vote": v.get("user_vote"),
                    "turn_count": v.get("turn_count"),
                    "base_model_name": v.get("base_model_name"),
                    "conversation_history": v.get("conversation_history"),
                    "model_config": v.get("model_config"),
                })

            # 5. Activity timeline (last 30 days, grouped by date)
            cutoff = datetime.utcnow() - timedelta(days=30)
            date_counts: Dict[str, int] = {}
            for v in stats_votes:
                created = v.get("created_at")
                if not created:
                    continue
                try:
                    dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    if dt.replace(tzinfo=None) >= cutoff:
                        day_key = dt.strftime("%Y-%m-%d")
                        date_counts[day_key] = date_counts.get(day_key, 0) + 1
                except (ValueError, AttributeError):
                    continue

            activity_timeline = sorted(
                [{"date": d, "count": c} for d, c in date_counts.items()],
                key=lambda x: x["date"]
            )

            return _response({
                "profile": profile,
                "stats": stats,
                "recent_conversations": recent_conversations,
                "activity_timeline": activity_timeline,
            })

    except Exception as exc:
        log_error(error_type="get_user_detail_error", context={"user_id": user_id}, exc=exc)
        return _error(f"Failed to get user detail: {str(exc)}", status=500)
