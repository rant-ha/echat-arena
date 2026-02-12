"""Health check route."""

from typing import Any, Dict

from fastapi import APIRouter

from arena.config import APP_VERSION
from arena.utils import _utc_now_iso
from arena.db.metrics import persistence_metrics
from arena.db.circuit_breaker import supabase_breaker
from arena.db.compensation import compensation_queue

router = APIRouter()


@router.get("/health")
async def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "version": APP_VERSION,
        "ts": _utc_now_iso(),
        "persistence": {
            "metrics": persistence_metrics.to_dict(),
            "circuit_breaker": supabase_breaker.to_dict(),
            "compensation_queue_size": compensation_queue.queue_size,
        },
    }
