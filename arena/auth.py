"""JWT authentication middleware for Supabase tokens."""

import os
from fastapi import HTTPException, Request, Depends
import jwt  # PyJWT

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")


async def require_auth(request: Request) -> dict:
    """FastAPI dependency: verify Supabase JWT and return user payload."""
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=500, detail="Auth not configured")
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload  # payload["sub"] = user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_user_id(auth_payload: dict) -> str:
    """Extract user_id (Supabase sub field) from JWT payload."""
    return auth_payload.get("sub", "")
