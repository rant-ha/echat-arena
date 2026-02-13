"""Admin archive route."""

from fastapi import APIRouter, Header

from arena.config import API_PREFIX, ARCHIVE_ENABLED
from arena.utils import _response, _error
from arena.archive import _run_archive_once
from arena.routes.admin.auth import _require_admin_token

router = APIRouter()


@router.post(f"{API_PREFIX}/admin/archive")
async def admin_archive(admin_token: str = Header(None, alias="admin-token")):
    """Archive endpoint - requires admin authentication."""
    await _require_admin_token(admin_token)

    if not ARCHIVE_ENABLED:
        return _error("ARCHIVE_ENABLED is not set", status=400)
    try:
        payload = await _run_archive_once()
        return _response(payload)
    except Exception as exc:
        return _error(f"archive failed: {exc}", status=500)
