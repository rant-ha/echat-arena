"""Public config and models routes."""

import time
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from arena.config import (
    API_PREFIX,
    REPLY_MODEL_NAME, BASELINE_MODEL_ID,
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
)
from arena.utils import _response, log_error

router = APIRouter()


@router.get(f"{API_PREFIX}/config")
async def get_config() -> JSONResponse:
    # Expose single base_model_name (frontend should not select models)
    data = {
        "base_model_name": REPLY_MODEL_NAME or BASELINE_MODEL_ID or "",
    }
    return _response(data)


# Rate limiting for public models endpoint
_MODELS_RATE_LIMIT: Dict[str, List[float]] = {}
_MODELS_RATE_LIMIT_WINDOW = 60  # seconds
_MODELS_RATE_LIMIT_MAX = 60  # requests per window


def _check_models_rate_limit(client_ip: str) -> bool:
    """Check if client is within rate limit for /models endpoint."""
    now = time.time()
    if client_ip not in _MODELS_RATE_LIMIT:
        _MODELS_RATE_LIMIT[client_ip] = []
    _MODELS_RATE_LIMIT[client_ip] = [
        t for t in _MODELS_RATE_LIMIT[client_ip]
        if now - t < _MODELS_RATE_LIMIT_WINDOW
    ]
    if len(_MODELS_RATE_LIMIT[client_ip]) >= _MODELS_RATE_LIMIT_MAX:
        return False
    _MODELS_RATE_LIMIT[client_ip].append(now)
    return True


@router.get(f"{API_PREFIX}/models")
async def list_public_models(req: Request) -> JSONResponse:
    """
    List enabled models for public selection.
    No authentication required. Rate limited to 60 req/min per IP.
    """
    client_ip = req.client.host if req.client else "unknown"
    if not _check_models_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return JSONResponse({
            "ok": True,
            "data": {
                "models": [],
                "default_model_key": REPLY_MODEL_NAME or BASELINE_MODEL_ID or None
            }
        })

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/model_configs",
                params={
                    "select": "model_key,model_name,description,is_default,weight,display_order",
                    "is_enabled": "eq.true",
                    "deleted_at": "is.null",
                    "order": "display_order.asc.nullslast,weight.desc,created_at.asc"
                },
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                timeout=5.0
            )

            if resp.status_code != 200:
                raise RuntimeError(f"DB query failed: {resp.status_code}")

            models = resp.json()
            default_model_key = None
            for m in models:
                if m.get("is_default"):
                    default_model_key = m.get("model_key")
                    break

            if not default_model_key:
                default_model_key = models[0].get("model_key") if models else (REPLY_MODEL_NAME or BASELINE_MODEL_ID)

            safe_models = [
                {
                    "model_key": m.get("model_key"),
                    "model_name": m.get("model_name"),
                    "description": m.get("description"),
                    "is_default": m.get("is_default", False)
                }
                for m in models
            ]

            return JSONResponse({
                "ok": True,
                "data": {"models": safe_models, "default_model_key": default_model_key}
            })
    except Exception as e:
        log_error("list_models_error", {"error": str(e)}, e)
        return JSONResponse({
            "ok": True,
            "data": {
                "models": [],
                "default_model_key": REPLY_MODEL_NAME or BASELINE_MODEL_ID or None
            }
        })
