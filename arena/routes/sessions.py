"""Session management routes."""

from fastapi import APIRouter, Body, Header, HTTPException
from fastapi.responses import JSONResponse

from arena.config import API_PREFIX
from arena.state import get_state
from arena.routes.admin.auth import _require_admin_token

router = APIRouter()


@router.post(f"{API_PREFIX}/sessions/list")
async def list_sessions(
    page: int = Body(1),
    page_size: int = Body(50),
    include_deleted: bool = Body(False),
    admin_token: str = Header(None, alias="admin-token")
) -> JSONResponse:
    """
    管理员接口：列表会话与统计
    """
    # Check admin token
    await _require_admin_token(admin_token)

    _SESSION_STORE = get_state().session_store

    # Use the SessionStore's list_sessions method
    result = await _SESSION_STORE.list_sessions(
        page=page,
        page_size=page_size,
        include_deleted=include_deleted
    )

    return JSONResponse(result)


@router.post(f"{API_PREFIX}/session/delete")
async def soft_delete_session(
    session_id: str = Body(..., embed=True),
    admin_token: str = Header(None, alias="admin-token")
) -> JSONResponse:
    """
    管理员接口：软删除会话
    """
    # Check admin token
    await _require_admin_token(admin_token)

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    _SESSION_STORE = get_state().session_store

    # Perform soft delete
    success = await _SESSION_STORE.soft_delete(session_id)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to soft delete session")

    return JSONResponse({
        "success": True,
        "session_id": session_id
    })


@router.post(f"{API_PREFIX}/session/restore")
async def restore_session_endpoint(
    session_id: str = Body(..., embed=True),
    admin_token: str = Header(None, alias="admin-token")
) -> JSONResponse:
    """
    管理员接口：恢复被软删除的会话
    """
    # Check admin token
    await _require_admin_token(admin_token)

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    _SESSION_STORE = get_state().session_store

    # Perform restore
    success = await _SESSION_STORE.restore_session(session_id)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to restore session")

    return JSONResponse({
        "success": True,
        "session_id": session_id
    })


@router.post(f"{API_PREFIX}/sessions/cleanup")
async def cleanup_deleted_sessions_endpoint(
    max_age_days: int = Body(30, embed=True),
    admin_token: str = Header(None, alias="admin-token")
) -> JSONResponse:
    """
    管理员接口：清理超过指定天数的软删除会话
    """
    # Check admin token
    await _require_admin_token(admin_token)

    _SESSION_STORE = get_state().session_store

    # Perform cleanup
    deleted_count = await _SESSION_STORE.cleanup_deleted_sessions(max_age_days)

    return JSONResponse({
        "success": True,
        "deleted_count": deleted_count,
        "max_age_days": max_age_days
    })
