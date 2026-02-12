"""Shared httpx client for Supabase REST API calls."""

from typing import Optional

import httpx

from arena.config import SUPABASE_SERVICE_KEY, REQUEST_TIMEOUT

_client: Optional[httpx.AsyncClient] = None


def get_supabase_client() -> httpx.AsyncClient:
    """Return the shared httpx.AsyncClient, creating it if needed."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_keepalive_connections=20,
                max_connections=50,
                keepalive_expiry=30,
            ),
            timeout=REQUEST_TIMEOUT,
        )
    return _client


async def close_supabase_client() -> None:
    """Gracefully close the shared client (call on application shutdown)."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


def get_supabase_headers() -> dict:
    """Return standard Supabase REST API headers."""
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
