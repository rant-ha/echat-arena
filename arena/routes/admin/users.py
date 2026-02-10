"""Admin user management routes."""

from typing import Any, Dict

import httpx
from fastapi import APIRouter, Header

from arena.config import API_PREFIX, SUPABASE_URL, SUPABASE_SERVICE_KEY
from arena.utils import _response, _error, log_error
from arena.routes.admin.auth import _require_admin_token

router = APIRouter()


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
        async with httpx.AsyncClient() as client:
            # Get users from auth.users via admin API
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
                # Query vote counts
                votes_resp = await client.get(
                    f"{SUPABASE_URL}/rest/v1/votes",
                    params={
                        "select": "user_id",
                        "user_id": f"in.({','.join(user_ids)})",
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
                except:
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
