"""JWT authentication middleware for Supabase tokens."""

import logging
import os
from fastapi import HTTPException, Request, Depends
import jwt  # PyJWT
from jwt import PyJWKClient

from arena.config import SUPABASE_URL

logger = logging.getLogger(__name__)

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

# ---------------------------------------------------------------------------
# JWKS client (lazy-init, 10-minute key cache)
# ---------------------------------------------------------------------------
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient | None:
    global _jwks_client
    if _jwks_client is None and SUPABASE_URL:
        jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        try:
            _jwks_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=600)
            logger.info("JWKS client initialised: %s", jwks_url)
        except Exception as exc:
            logger.warning("Failed to create JWKS client: %s", exc)
    return _jwks_client


async def require_auth(request: Request) -> dict:
    """FastAPI dependency: verify Supabase JWT and return user payload."""
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    # --- Strategy 1: JWKS (supports RS256 / ES256 / HS256 from Supabase) ---
    jwks = _get_jwks_client()
    if jwks is not None:
        try:
            signing_key = jwks.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256", "HS256"],
                audience="authenticated",
            )
            return payload
        except Exception as jwks_exc:
            logger.debug("JWKS verification failed (%s), trying HS256 fallback", type(jwks_exc).__name__)

    # --- Strategy 2: HS256 with shared secret (legacy / fallback) ----------
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=500, detail="Auth not configured")
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        logger.warning("JWT verification failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=401, detail="Invalid token")


def get_user_id(auth_payload: dict) -> str:
    """Extract user_id (Supabase sub field) from JWT payload."""
    return auth_payload.get("sub", "")
