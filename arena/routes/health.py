"""Health check route."""

from typing import Any, Dict

from fastapi import APIRouter

from arena.config import APP_VERSION
from arena.utils import _utc_now_iso

router = APIRouter()


@router.get("/health")
async def health() -> Dict[str, Any]:
    return {"ok": True, "version": APP_VERSION, "ts": _utc_now_iso()}
