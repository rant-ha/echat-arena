"""Admin conversation viewer routes."""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Header, Query

from arena.config import API_PREFIX, SUPABASE_URL, SUPABASE_SERVICE_KEY
from arena.utils import _response, _error, log_error
from arena.routes.admin.auth import _require_admin_token

router = APIRouter()


@router.get(f"{API_PREFIX}/admin/conversations")
async def list_conversations(
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    vote_type: str = "",
    date_from: str = "",
    date_to: str = "",
    model: str = "",
    admin_token: str = Header(None, alias="admin-token")
):
    """
    List all conversations with full content from votes table.

    Query params:
    - page, page_size: pagination
    - search: search in prompt text or user_email
    - vote_type: filter by user_vote (model_a, model_b, tie, both_bad)
    - date_from, date_to: ISO date strings for date range filter
    - model: filter by base_model_name
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        # Clamp pagination bounds
        page = max(page, 1)
        page_size = min(max(page_size, 1), 200)

        offset = (page - 1) * page_size

        # Sanitize inputs to prevent PostgREST filter injection
        safe_search = re.sub(r"[(),%.\"\\'*_]", "", search) if search else ""
        date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}")
        if date_from and not date_pattern.match(date_from):
            date_from = ""
        if date_to and not date_pattern.match(date_to):
            date_to = ""

        async with httpx.AsyncClient() as client:
            # Build query params for votes table
            params: Dict[str, str] = {
                "select": "id,created_at,prompt,reply_a,reply_b,user_vote,user_email,user_id,turn_count,base_model_name,model_config,conversation_history,winner_type",
                "order": "created_at.desc",
                "offset": str(offset),
                "limit": str(page_size),
            }

            # Apply filters
            if safe_search:
                # PostgREST 'or' filter for prompt and user_email
                params["or"] = f"(prompt.ilike.%{safe_search}%,user_email.ilike.%{safe_search}%)"

            VALID_VOTE_TYPES = {"model_a", "model_b", "tie", "both_bad"}
            if vote_type and vote_type in VALID_VOTE_TYPES:
                params["user_vote"] = f"eq.{vote_type}"

            if date_from:
                params["created_at"] = f"gte.{date_from}"

            if date_to:
                # If both date_from and date_to, need 'and' syntax
                if date_from:
                    # Use PostgREST 'and' for range
                    params.pop("created_at", None)
                    params["and"] = f"(created_at.gte.{date_from},created_at.lte.{date_to}T23:59:59)"
                else:
                    params["created_at"] = f"lte.{date_to}T23:59:59"

            if model and re.match(r"^[a-zA-Z0-9._-]+$", model):
                params["base_model_name"] = f"eq.{model}"

            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/votes",
                params=params,
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Prefer": "count=exact",
                },
                timeout=30.0
            )

            # PostgREST returns 206 Partial Content when using
            # Prefer: count=exact with paginated results
            if resp.status_code not in (200, 206):
                return _error("Failed to fetch conversations", status=500)

            conversations = resp.json()

            # Get total from content-range header
            content_range = resp.headers.get("content-range", "")
            total = 0
            if "/" in content_range:
                try:
                    total = int(content_range.split("/")[1])
                except (ValueError, IndexError):
                    total = len(conversations)

            return _response({
                "conversations": conversations,
                "total": total,
                "page": page,
                "page_size": page_size,
            })

    except Exception as exc:
        log_error(error_type="list_conversations_error", context={}, exc=exc)
        return _error(f"Failed to list conversations: {str(exc)}", status=500)


@router.get(f"{API_PREFIX}/admin/conversations/export")
async def export_conversations(
    search: str = "",
    vote_type: str = "",
    date_from: str = "",
    date_to: str = "",
    model: str = "",
    admin_token: str = Header(None, alias="admin-token"),
):
    """Export all matching conversations for CSV download (max 10000)."""
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        MAX_EXPORT = 10000

        # Same sanitization as list_conversations
        safe_search = re.sub(r"[(),%.\"\\'*_]", "", search) if search else ""
        date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}")

        VALID_VOTE_TYPES = {"model_a", "model_b", "tie", "both_bad"}

        params: Dict[str, str] = {
            "select": "id,created_at,user_email,prompt,reply_a,reply_b,user_vote,turn_count,base_model_name,winner_type,model_config",
            "order": "created_at.desc",
            "limit": str(MAX_EXPORT),
        }

        if safe_search:
            params["or"] = f"(prompt.ilike.%{safe_search}%,user_email.ilike.%{safe_search}%)"

        if vote_type and vote_type in VALID_VOTE_TYPES:
            params["user_vote"] = f"eq.{vote_type}"

        if date_from and date_pattern.match(date_from):
            if date_to and date_pattern.match(date_to):
                params["and"] = f"(created_at.gte.{date_from},created_at.lte.{date_to}T23:59:59)"
            else:
                params["created_at"] = f"gte.{date_from}"
        elif date_to and date_pattern.match(date_to):
            params["created_at"] = f"lte.{date_to}T23:59:59"

        if model and re.match(r"^[a-zA-Z0-9._-]+$", model):
            params["base_model_name"] = f"eq.{model}"

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/votes",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                params=params,
                timeout=30.0,
            )

        if resp.status_code != 200:
            return _error("Failed to fetch conversations for export")

        conversations = resp.json()
        return _response({"conversations": conversations, "total": len(conversations)})

    except Exception as exc:
        log_error(error_type="export_conversations_error", context={}, exc=exc)
        return _error(f"Failed to export conversations: {str(exc)}", status=500)
