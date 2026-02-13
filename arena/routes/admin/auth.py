"""Admin authentication routes and helpers."""

import os
import secrets
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, Body, Header, HTTPException, Request

from arena.config import (
    API_PREFIX,
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
)
from arena.utils import _response, _error, log_error

router = APIRouter()

from arena.config import ADMIN_PASSWORD, ADMIN_JWT_SECRET

# Token storage - uses database when available, falls back to in-memory
_ADMIN_TOKENS: Dict[str, datetime] = {}  # Fallback for when Supabase is not configured
TOKEN_EXPIRY_HOURS = 24


async def _generate_admin_token(ip_address: str = None, user_agent: str = None) -> tuple:
    """Generate a secure admin token and store in database (or memory as fallback)."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        # Fallback to in-memory if Supabase not configured
        _ADMIN_TOKENS[token] = expires_at
        return token, expires_at

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/admin_sessions",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "token": token,
                    "expires_at": expires_at.isoformat() + "Z",
                    "ip_address": ip_address,
                    "user_agent": user_agent,
                },
                timeout=10.0
            )
            if resp.status_code not in (200, 201):
                # Fallback to in-memory on database error
                _ADMIN_TOKENS[token] = expires_at
    except Exception:
        # Fallback to in-memory on any error
        _ADMIN_TOKENS[token] = expires_at

    return token, expires_at


async def _verify_admin_token(token: str) -> bool:
    """Verify if admin token is valid and not expired."""
    if not token:
        return False

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        # Fallback to in-memory
        if token not in _ADMIN_TOKENS:
            return False
        expiry = _ADMIN_TOKENS.get(token)
        if expiry is None or datetime.utcnow() > expiry:
            _ADMIN_TOKENS.pop(token, None)
            return False
        return True

    try:
        async with httpx.AsyncClient() as client:
            now_iso = datetime.utcnow().isoformat() + "Z"
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/admin_sessions",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                params={
                    "token": f"eq.{token}",
                    "expires_at": f"gt.{now_iso}",
                    "select": "id,expires_at",
                },
                timeout=10.0
            )

            if resp.status_code != 200:
                # Fallback: check in-memory
                return token in _ADMIN_TOKENS and _ADMIN_TOKENS.get(token, datetime.min) > datetime.utcnow()

            data = resp.json()
            return len(data) > 0
    except Exception:
        # Fallback: check in-memory
        return token in _ADMIN_TOKENS and _ADMIN_TOKENS.get(token, datetime.min) > datetime.utcnow()


async def _delete_admin_token(token: str) -> bool:
    """Delete admin token from database (or memory as fallback)."""
    if not token:
        return False

    # Always remove from in-memory cache
    _ADMIN_TOKENS.pop(token, None)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return True

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{SUPABASE_URL}/rest/v1/admin_sessions",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                params={"token": f"eq.{token}"},
                timeout=10.0
            )
            return resp.status_code in (200, 204)
    except Exception:
        return True  # Already removed from memory


async def _get_admin_token_expiry(token: str) -> datetime:
    """Get token expiry time from database or memory."""
    if not token:
        return None

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _ADMIN_TOKENS.get(token)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/admin_sessions",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                params={
                    "token": f"eq.{token}",
                    "select": "expires_at",
                },
                timeout=10.0
            )

            if resp.status_code == 200:
                data = resp.json()
                if data:
                    # Parse ISO timestamp
                    expires_str = data[0].get("expires_at", "")
                    if expires_str:
                        return datetime.fromisoformat(expires_str.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        pass

    return _ADMIN_TOKENS.get(token)


def _verify_admin_password(password: str) -> bool:
    """Verify admin password using constant-time comparison."""
    if not ADMIN_PASSWORD:
        return False
    return secrets.compare_digest(password, ADMIN_PASSWORD)


# Rate limiting for login attempts — exponential backoff
_LOGIN_ATTEMPTS: Dict[str, List[datetime]] = {}
MAX_LOGIN_ATTEMPTS = 5


def _get_lockout_minutes(failure_count: int) -> int:
    """Exponential backoff: 1, 2, 4, 8, 16, 32, 60 min cap."""
    if failure_count < MAX_LOGIN_ATTEMPTS:
        return 0
    exponent = failure_count - MAX_LOGIN_ATTEMPTS
    return min(2 ** exponent, 60)


def _check_rate_limit(ip: str) -> bool:
    """Check if IP is rate limited with exponential backoff. Returns True if allowed."""
    now = datetime.utcnow()

    if ip not in _LOGIN_ATTEMPTS:
        _LOGIN_ATTEMPTS[ip] = []

    # Clean attempts older than 60 minutes (max lockout)
    cutoff = now - timedelta(minutes=60)
    _LOGIN_ATTEMPTS[ip] = [t for t in _LOGIN_ATTEMPTS[ip] if t > cutoff]

    # Periodic cleanup: remove IPs with no recent attempts
    if len(_LOGIN_ATTEMPTS) > 1000:
        stale_ips = [k for k, v in _LOGIN_ATTEMPTS.items() if not v]
        for k in stale_ips:
            del _LOGIN_ATTEMPTS[k]

    count = len(_LOGIN_ATTEMPTS[ip])
    if count < MAX_LOGIN_ATTEMPTS:
        return True

    lockout_min = _get_lockout_minutes(count)
    last_attempt = _LOGIN_ATTEMPTS[ip][-1] if _LOGIN_ATTEMPTS[ip] else now
    if now < last_attempt + timedelta(minutes=lockout_min):
        return False

    return True


def _record_login_attempt(ip: str):
    """Record a failed login attempt."""
    if ip not in _LOGIN_ATTEMPTS:
        _LOGIN_ATTEMPTS[ip] = []
    _LOGIN_ATTEMPTS[ip].append(datetime.utcnow())


async def _require_admin_token(admin_token: str) -> bool:
    """Verify admin token and return True if valid, raise HTTPException if not."""
    if not admin_token or not await _verify_admin_token(admin_token):
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")
    return True


@router.post(f"{API_PREFIX}/admin/login")
async def admin_login(request: Request, body: Dict[str, Any] = Body(...)):
    """
    Admin login endpoint - password authentication.

    Request body:
    {
        "password": "admin_password"
    }

    Response (success):
    {
        "ok": true,
        "data": {
            "token": "secure_token",
            "expires_at": "ISO timestamp"
        }
    }

    Response (failure):
    {
        "ok": false,
        "error": "Invalid password"
    }
    """
    # Get client IP for rate limiting
    client_ip = request.client.host if request.client else "unknown"

    # Check rate limit
    if not _check_rate_limit(client_ip):
        return _error("Too many login attempts. Please try again later.", status=429)

    password = (body.get("password") or "").strip()

    if not password:
        _record_login_attempt(client_ip)
        return _error("Password is required", status=400)

    if not _verify_admin_password(password):
        _record_login_attempt(client_ip)
        # Log failed attempt
        log_error(
            error_type="admin_login_failed",
            context={"ip": client_ip},
            exc=None
        )
        return _error("Invalid password", status=401)

    # Get user agent for session tracking
    user_agent = request.headers.get("user-agent", "")[:500]  # Limit length

    # Generate token (now async and stores in database)
    token, expires_at = await _generate_admin_token(ip_address=client_ip, user_agent=user_agent)

    # Log successful login
    print(f"[ADMIN] Login successful from {client_ip}", file=sys.stderr)

    return _response({
        "token": token,
        "expires_at": expires_at.isoformat() + "Z"
    })


@router.post(f"{API_PREFIX}/admin/verify")
async def admin_verify(admin_token: str = Header(None, alias="admin-token")):
    """
    Verify admin token validity.

    Headers:
    - admin-token: Token from login

    Response:
    {
        "ok": true,
        "data": {
            "valid": true,
            "expires_at": "ISO timestamp"
        }
    }
    """
    if not admin_token:
        return _error("admin-token header is required", status=401)

    if not await _verify_admin_token(admin_token):
        return _error("Invalid or expired token", status=401)

    expires_at = await _get_admin_token_expiry(admin_token)

    return _response({
        "valid": True,
        "expires_at": expires_at.isoformat() + "Z" if expires_at else None
    })


@router.post(f"{API_PREFIX}/admin/logout")
async def admin_logout(admin_token: str = Header(None, alias="admin-token")):
    """
    Admin logout - invalidate token.

    Headers:
    - admin-token: Token to invalidate

    Response:
    {
        "ok": true,
        "data": {
            "logged_out": true
        }
    }
    """
    if admin_token:
        await _delete_admin_token(admin_token)

    return _response({
        "logged_out": True
    })
