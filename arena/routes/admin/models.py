"""Admin model configuration CRUD routes."""

from datetime import datetime
from typing import Any, Dict

import httpx
from fastapi import APIRouter, Body, Header

from arena.config import API_PREFIX, SUPABASE_URL, SUPABASE_SERVICE_KEY
from arena.utils import _response, _error, log_error
from arena.routes.admin.auth import _require_admin_token

router = APIRouter()


@router.get(f"{API_PREFIX}/admin/models")
async def list_models(
    page: int = 1,
    page_size: int = 20,
    include_disabled: bool = False,
    include_deleted: bool = False,
    admin_token: str = Header(None, alias="admin-token")
):
    """
    List all model configurations.

    Query params:
    - page: Page number (default 1)
    - page_size: Items per page (default 20)
    - include_disabled: Include disabled models (default false)
    - include_deleted: Include soft-deleted models (default false)

    Headers:
    - admin-token: Admin authentication token
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        # Build query
        conditions = []
        if not include_deleted:
            conditions.append("deleted_at IS NULL")
        if not include_disabled:
            conditions.append("is_enabled = true")

        async with httpx.AsyncClient() as client:
            # Get models with pagination
            offset = (page - 1) * page_size

            # Use Supabase REST API
            url = f"{SUPABASE_URL}/rest/v1/model_configs"
            params_dict = {
                "select": "id,model_key,model_name,api_type,api_base,is_enabled,anony_only,weight,display_order,description,created_at,updated_at,deleted_at",
                "order": "display_order.asc.nullslast,created_at.desc",
                "offset": str(offset),
                "limit": str(page_size),
            }

            if not include_deleted:
                params_dict["deleted_at"] = "is.null"
            if not include_disabled:
                params_dict["is_enabled"] = "eq.true"

            resp = await client.get(
                url,
                params=params_dict,
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Prefer": "count=exact",
                },
                timeout=10.0
            )

            if resp.status_code != 200:
                return _error(f"Database error: {resp.text}", status=500)

            models = resp.json()

            # Get total from header
            content_range = resp.headers.get("content-range", "")
            total = 0
            if "/" in content_range:
                try:
                    total = int(content_range.split("/")[1])
                except:
                    total = len(models)

            # Mask API keys - only show last 4 chars
            for model in models:
                if model.get("api_base"):
                    # Keep api_base visible for admin
                    pass
                # Remove encrypted key from response
                model.pop("api_key_encrypted", None)

            return _response({
                "total": total,
                "page": page,
                "page_size": page_size,
                "models": models
            })

    except Exception as exc:
        log_error(error_type="list_models_error", context={}, exc=exc)
        return _error(f"Failed to list models: {str(exc)}", status=500)


@router.post(f"{API_PREFIX}/admin/models")
async def create_model(
    body: Dict[str, Any] = Body(...),
    admin_token: str = Header(None, alias="admin-token")
):
    """
    Create a new model configuration.

    Request body:
    {
        "model_key": "unique-model-key",
        "model_name": "Display Name",
        "api_type": "openai",
        "api_base": "https://api.example.com/v1",
        "api_key": "sk-xxx",
        "is_enabled": true,
        "anony_only": true,
        "weight": 100,
        "description": "Optional description"
    }
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    # Validate required fields
    model_key = (body.get("model_key") or "").strip()
    model_name = (body.get("model_name") or "").strip()

    if not model_key:
        return _error("model_key is required", status=400)
    if not model_name:
        return _error("model_name is required", status=400)

    # Prepare data
    data = {
        "model_key": model_key,
        "model_name": model_name,
        "api_type": body.get("api_type", "openai"),
        "api_base": body.get("api_base", ""),
        "api_key_encrypted": body.get("api_key", ""),  # TODO: encrypt in production
        "is_enabled": body.get("is_enabled", True),
        "anony_only": body.get("anony_only", True),
        "weight": body.get("weight", 100),
        "description": body.get("description", ""),
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/model_configs",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                },
                json=data,
                timeout=10.0
            )

            if resp.status_code == 409:
                return _error("Model key already exists", status=409)
            if resp.status_code not in (200, 201):
                return _error(f"Database error: {resp.text}", status=500)

            result = resp.json()
            created = result[0] if isinstance(result, list) else result

            # Remove sensitive data from response
            created.pop("api_key_encrypted", None)

            return _response({
                "id": created.get("id"),
                "model_key": created.get("model_key")
            })

    except Exception as exc:
        log_error(error_type="create_model_error", context={"model_key": model_key}, exc=exc)
        return _error(f"Failed to create model: {str(exc)}", status=500)


@router.put(f"{API_PREFIX}/admin/models/reorder")
async def reorder_models(
    body: Dict[str, Any] = Body(...),
    admin_token: str = Header(None, alias="admin-token")
):
    """
    Batch update model display order.
    Body: {"orders": [{"id": "model-id", "display_order": 1}, ...]}
    """
    await _require_admin_token(admin_token)

    orders = body.get("orders", [])
    if not orders or not isinstance(orders, list):
        return _error("orders array required")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        async with httpx.AsyncClient() as client:
            for item in orders:
                model_id = item.get("id")
                display_order = item.get("display_order")
                if not model_id or display_order is None:
                    continue

                resp = await client.patch(
                    f"{SUPABASE_URL}/rest/v1/model_configs",
                    params={"id": f"eq.{model_id}"},
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    },
                    json={"display_order": display_order, "updated_at": datetime.utcnow().isoformat()},
                    timeout=10.0
                )

                if resp.status_code not in (200, 204):
                    return _error(f"Failed to update model {model_id}", status=500)

        return _response({"updated": len(orders)})
    except Exception as exc:
        log_error(error_type="reorder_models_error", context={}, exc=exc)
        return _error(f"Failed to reorder: {str(exc)}", status=500)


@router.put(f"{API_PREFIX}/admin/models/{{model_id}}")
async def update_model(
    model_id: str,
    body: Dict[str, Any] = Body(...),
    admin_token: str = Header(None, alias="admin-token")
):
    """
    Update a model configuration.

    Path params:
    - model_id: UUID of the model

    Request body (all fields optional):
    {
        "model_name": "Updated Name",
        "api_base": "https://...",
        "api_key": "new-key-or-null",  // null = keep existing
        "is_enabled": false,
        "weight": 50,
        "description": "..."
    }
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    # Prepare update data (only include provided fields)
    update_data = {}

    if "model_name" in body:
        update_data["model_name"] = body["model_name"]
    if "api_type" in body:
        update_data["api_type"] = body["api_type"]
    if "api_base" in body:
        update_data["api_base"] = body["api_base"]
    if "api_key" in body and body["api_key"] is not None:
        update_data["api_key_encrypted"] = body["api_key"]  # TODO: encrypt
    if "is_enabled" in body:
        update_data["is_enabled"] = body["is_enabled"]
    if "anony_only" in body:
        update_data["anony_only"] = body["anony_only"]
    if "weight" in body:
        update_data["weight"] = body["weight"]
    if "display_order" in body:
        update_data["display_order"] = body["display_order"]
    if "description" in body:
        update_data["description"] = body["description"]

    if not update_data:
        return _error("No fields to update", status=400)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{SUPABASE_URL}/rest/v1/model_configs?id=eq.{model_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                },
                json=update_data,
                timeout=10.0
            )

            if resp.status_code == 404:
                return _error("Model not found", status=404)
            if resp.status_code not in (200, 204):
                return _error(f"Database error: {resp.text}", status=500)

            result = resp.json()
            if not result:
                return _error("Model not found", status=404)

            updated = result[0] if isinstance(result, list) else result
            updated.pop("api_key_encrypted", None)

            return _response({
                "id": updated.get("id"),
                "model_key": updated.get("model_key"),
                "updated": True
            })

    except Exception as exc:
        log_error(error_type="update_model_error", context={"model_id": model_id}, exc=exc)
        return _error(f"Failed to update model: {str(exc)}", status=500)


@router.delete(f"{API_PREFIX}/admin/models/{{model_id}}")
async def delete_model(
    model_id: str,
    admin_token: str = Header(None, alias="admin-token")
):
    """
    Soft delete a model configuration.

    Path params:
    - model_id: UUID of the model
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        async with httpx.AsyncClient() as client:
            # Soft delete by setting deleted_at
            resp = await client.patch(
                f"{SUPABASE_URL}/rest/v1/model_configs?id=eq.{model_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                },
                json={"deleted_at": datetime.utcnow().isoformat()},
                timeout=10.0
            )

            if resp.status_code not in (200, 204):
                return _error(f"Database error: {resp.text}", status=500)

            result = resp.json()
            if not result:
                return _error("Model not found", status=404)

            return _response({
                "id": model_id,
                "deleted": True
            })

    except Exception as exc:
        log_error(error_type="delete_model_error", context={"model_id": model_id}, exc=exc)
        return _error(f"Failed to delete model: {str(exc)}", status=500)


@router.get(f"{API_PREFIX}/admin/models/{{model_id}}")
async def get_model(
    model_id: str,
    admin_token: str = Header(None, alias="admin-token")
):
    """
    Get a single model configuration by ID.

    Path params:
    - model_id: UUID of the model
    """
    await _require_admin_token(admin_token)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return _error("Supabase not configured", status=500)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/model_configs?id=eq.{model_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
                timeout=10.0
            )

            if resp.status_code != 200:
                return _error(f"Database error: {resp.text}", status=500)

            result = resp.json()
            if not result:
                return _error("Model not found", status=404)

            model = result[0]
            # Mask API key
            if model.get("api_key_encrypted"):
                key = model["api_key_encrypted"]
                model["api_key_masked"] = f"****{key[-4:]}" if len(key) > 4 else "****"
            model.pop("api_key_encrypted", None)

            return _response(model)

    except Exception as exc:
        log_error(error_type="get_model_error", context={"model_id": model_id}, exc=exc)
        return _error(f"Failed to get model: {str(exc)}", status=500)
