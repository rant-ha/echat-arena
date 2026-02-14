"""Draft conversation CRUD routes."""

import sys
import time
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query
from fastapi.responses import JSONResponse

from arena.config import (
    API_PREFIX,
    REPLY_MODEL_NAME, BASELINE_MODEL_ID,
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    ALLOWED_VOTES,
)
from arena.utils import _utc_now_iso, _json_dumps, log_error
from arena.db.helpers import _looks_like_unique_violation
from arena.db.votes import _insert_vote_supabase, _update_vote_supabase, _fetch_vote_id_by_session_id_supabase
from arena.evaluator import _judge_with_ai
from arena.state import get_state
from arena.auth import require_auth, get_user_id

router = APIRouter()


@router.post(f"{API_PREFIX}/draft")
async def save_draft(body: Dict[str, Any] = Body(...), auth: dict = Depends(require_auth)) -> JSONResponse:
    """Save or update a draft conversation (unvoted)."""
    session_id = (body.get("session_id") or "").strip()
    if not session_id:
        return JSONResponse({"ok": False, "error": "session_id required"}, status_code=400)

    user_id = get_user_id(auth)
    user_email = auth.get("email", "")
    prompt = body.get("prompt", "")
    reply_a = body.get("reply_a", "")
    reply_b = body.get("reply_b", "")
    model_a = body.get("model_a", "")
    model_b = body.get("model_b", "")
    conversation_history = body.get("conversation_history")
    turn_count = body.get("turn_count", 1)
    model_config = body.get("model_config")

    try:
        row = {
            "session_id": session_id,
            "user_id": user_id,
            "user_email": user_email,
            "prompt": prompt,
            "reply_a": reply_a,
            "reply_b": reply_b,
            "model_a": model_a,
            "model_b": model_b,
            "conversation_history": conversation_history,
            "turn_count": turn_count,
            "model_config": model_config,
            "updated_at": _utc_now_iso(),
        }

        # Upsert: if session_id exists, update; otherwise insert
        url = f"{SUPABASE_URL}/rest/v1/draft_conversations?on_conflict=session_id"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=headers, json=row, timeout=10.0)
            if resp.status_code >= 400:
                # Log error with context
                log_error("draft_save_failed", {
                    "session_id": session_id,
                    "status_code": resp.status_code,
                    "user_id": user_id,
                    "user_email": user_email,
                    "turn_count": turn_count,
                    "response_text": resp.text[:500],  # Truncate long responses
                }, None)

                if _looks_like_unique_violation(resp):
                    # Concurrent insert won, fall back to PATCH
                    patch_url = f"{SUPABASE_URL}/rest/v1/draft_conversations?session_id=eq.{session_id}"
                    patch_headers = {
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json",
                    }
                    resp = await client.patch(patch_url, headers=patch_headers, json=row, timeout=10.0)
                    if resp.status_code < 400:
                        # Log successful fallback
                        print(_json_dumps({
                            "t": _utc_now_iso(),
                            "type": "draft_save_fallback_success",
                            "session": session_id,
                            "user_id": user_id,
                            "turn_count": turn_count,
                        }))
                        return JSONResponse({"ok": True, "session_id": session_id})
                    else:
                        # Log fallback failure
                        log_error("draft_save_fallback_failed", {
                            "session_id": session_id,
                            "status_code": resp.status_code,
                            "user_id": user_id,
                            "response_text": resp.text[:500],
                        }, None)
                log_error("draft_save_db_error", {"session_id": session_id, "status": resp.status_code, "detail": resp.text[:200]}, None)
                return JSONResponse({"ok": False, "error": "Internal server error"}, status_code=500)

        # Log successful save
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "draft_save_success",
            "session": session_id,
            "user_id": user_id,
            "user_email": user_email,
            "turn_count": turn_count,
        }))

        return JSONResponse({"ok": True, "session_id": session_id})
    except Exception as e:
        # Log exception with context
        log_error("draft_save_exception", {
            "session_id": session_id,
            "user_id": user_id,
            "user_email": user_email,
            "turn_count": turn_count,
            "error": str(e),
        }, e)
        return JSONResponse({"ok": False, "error": "Internal server error"}, status_code=500)


@router.get(f"{API_PREFIX}/drafts")
async def get_drafts(auth: dict = Depends(require_auth)) -> JSONResponse:
    """Get list of draft conversations for the authenticated user."""
    user_id = get_user_id(auth)
    if not user_id:
        return JSONResponse({"ok": False, "error": "Authentication required"}, status_code=401)

    try:
        url = f"{SUPABASE_URL}/rest/v1/draft_conversations"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }

        params = {"select": "*", "order": "updated_at.desc", "limit": "50", "user_id": f"eq.{user_id}"}

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=10.0)
            if resp.status_code >= 400:
                return JSONResponse({"ok": False, "error": "Internal server error"}, status_code=500)

            data = resp.json()

        return JSONResponse({"ok": True, "drafts": data})
    except Exception as e:
        return JSONResponse({"ok": False, "error": "Internal server error"}, status_code=500)


@router.get(f"{API_PREFIX}/draft/{{session_id}}")
async def get_single_draft(session_id: str, auth: dict = Depends(require_auth)) -> JSONResponse:
    """Get a single draft conversation by session_id."""
    if not session_id:
        return JSONResponse({"ok": False, "error": "session_id required"}, status_code=400)

    try:
        url = f"{SUPABASE_URL}/rest/v1/draft_conversations"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }
        params = {"session_id": f"eq.{session_id}"}

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=10.0)
            if resp.status_code >= 400:
                return JSONResponse({"ok": False, "error": "Database error"}, status_code=500)
            data = resp.json()
            if not data:
                # Best-effort fallback: check if session was already voted
                fallback_vote_id = None
                try:
                    fallback_vote_id = await _fetch_vote_id_by_session_id_supabase(session_id)
                except Exception:
                    pass  # Fallback failed — degrade to normal 404
                if fallback_vote_id:
                    return JSONResponse(
                        {"ok": False, "error": "Draft not found", "vote_id": fallback_vote_id},
                        status_code=404,
                        headers={"Cache-Control": "no-store"},
                    )
                return JSONResponse(
                    {"ok": False, "error": "Draft not found"},
                    status_code=404,
                    headers={"Cache-Control": "no-store"},
                )

            if data:
                draft_user_id = data[0].get("user_id")
                if draft_user_id and draft_user_id != get_user_id(auth):
                    return JSONResponse({"ok": False, "error": "Not found"}, status_code=404, headers={"Cache-Control": "no-store"})

                # Defensive check: draft exists but already voted → clean up stale draft
                existing_vote_id = None
                try:
                    existing_vote_id = await _fetch_vote_id_by_session_id_supabase(session_id)
                except Exception:
                    pass  # Query failed, skip check and return draft normally

                if existing_vote_id:
                    # Clean up stale draft
                    try:
                        async with httpx.AsyncClient() as cleanup_client:
                            await cleanup_client.delete(url, headers=headers, params=params, timeout=10.0)
                    except Exception as exc:
                        print(f"[WARN] failed to cleanup voted draft session={session_id}: {exc}", file=sys.stderr)
                    return JSONResponse(
                        {"ok": False, "error": "Draft not found", "vote_id": existing_vote_id},
                        status_code=404,
                        headers={"Cache-Control": "no-store"},
                    )

        return JSONResponse({"ok": True, "draft": data[0]})
    except Exception as e:
        return JSONResponse({"ok": False, "error": "Internal server error"}, status_code=500)


@router.post(f"{API_PREFIX}/draft/{{session_id}}/vote")
async def vote_draft(session_id: str, body: Dict[str, Any] = Body(...), background_tasks: BackgroundTasks = BackgroundTasks(), auth: dict = Depends(require_auth)) -> JSONResponse:
    """Vote on a draft conversation (for resumed/expired sessions).

    This endpoint handles voting when the original session has expired from memory.
    It reads draft data from the database and creates a vote record.
    """
    if not session_id:
        return JSONResponse({"ok": False, "error": "session_id required"}, status_code=400)

    vote_value = (body.get("vote") or "").strip()
    if vote_value not in ALLOWED_VOTES:
        return JSONResponse({"ok": False, "error": "invalid vote"}, status_code=400)

    user_id = get_user_id(auth)
    user_email = auth.get("email", "")

    try:
        # 1. Fetch draft from database
        url = f"{SUPABASE_URL}/rest/v1/draft_conversations"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }
        params = {"session_id": f"eq.{session_id}"}

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=10.0)
            if resp.status_code >= 400:
                return JSONResponse({"ok": False, "error": "Database error"}, status_code=500)
            data = resp.json()
            if not data:
                return JSONResponse({"ok": False, "error": "Draft not found"}, status_code=404)

        draft = data[0]

        draft_user_id = draft.get("user_id")
        if draft_user_id and draft_user_id != user_id:
            return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)

        # 2. Extract draft data
        model_config = draft.get("model_config") or {}
        left_config = model_config.get("left") or {}
        right_config = model_config.get("right") or {}
        left_arm = left_config.get("arm", "baseline")
        is_left_baseline = left_arm == "baseline"

        # 3. Map vote to DB semantics (model_a = baseline, model_b = strategy)
        if vote_value in ("left", "right"):
            if vote_value == "left":
                mapped_vote = "model_a" if is_left_baseline else "model_b"
            else:
                mapped_vote = "model_b" if is_left_baseline else "model_a"
        else:
            mapped_vote = vote_value

        # 4. Prepare replies (model_a = baseline, model_b = strategy)
        if is_left_baseline:
            reply_a_text = draft.get("reply_a", "")
            reply_b_text = draft.get("reply_b", "")
        else:
            reply_a_text = draft.get("reply_b", "")
            reply_b_text = draft.get("reply_a", "")

        # 5. Build vote row
        conversation_history = draft.get("conversation_history") or []
        turn_count = draft.get("turn_count") or 1

        # Compute semantic winner_type for statistics
        winner_type_map = {
            "model_a": "baseline",
            "model_b": "strategy",
            "tie": "tie",
            "both_bad": "both_bad",
        }
        winner_type = winner_type_map.get(mapped_vote)

        row = {
            "session_id": session_id,
            "user_id": user_id,
            "user_email": user_email,
            "prompt": draft.get("prompt", ""),
            "reply_a": reply_a_text,
            "reply_b": reply_b_text,
            "model_config": model_config,
            "user_vote": mapped_vote,
            "template_id": model_config.get("template_id", "draft_vote"),
            "strategy_name": model_config.get("strategy_name", "draft_vote"),
            "conversation_history": conversation_history,
            "turn_count": turn_count,
            "base_model_name": draft.get("model_a") or "unknown",
            # Semantic winner type for statistics (baseline/strategy/tie/both_bad)
            "winner_type": winner_type,
            # Optional fields for schema consistency
            "user_tags": None,
            "user_comment": None,
            "ai_scores": None,
            "client_info": None,
        }

        # 6. Insert vote
        vote_id = await _insert_vote_supabase(row)
        if not vote_id:
            return JSONResponse({"ok": False, "error": "Failed to create vote"}, status_code=500)

        # 6.5. Schedule background evaluation with full conversation context
        async def _bg_eval_draft() -> None:
            try:
                conv_history = draft.get("conversation_history") or []
                p = draft.get("prompt", "")

                # Correct reply_key mapping based on baseline position
                # conversation_history: reply_a = LEFT, reply_b = RIGHT
                # DB: model_a = baseline, model_b = strategy
                if is_left_baseline:
                    reply_key_a = "reply_a"
                    reply_key_b = "reply_b"
                else:
                    reply_key_a = "reply_b"
                    reply_key_b = "reply_a"

                # Evaluate each model's conversation chain separately
                score_a = await _judge_with_ai(p, reply_a_text, conv_history, reply_key_a)
                score_b = await _judge_with_ai(p, reply_b_text, conv_history, reply_key_b)
                computed_scores = {"model_a": score_a, "model_b": score_b}

                # Update Supabase vote record with AI scores
                if vote_id:
                    await _update_vote_supabase(session_id, computed_scores)

                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "draft_vote_eval_complete",
                    "session": session_id,
                    "vote_id": vote_id,
                    "turn_count": len(conv_history) if conv_history else 1,
                    "baseline_position": "left" if is_left_baseline else "right"
                }))
            except Exception as exc:
                print(f"[WARN] draft_vote_eval failed session={session_id}: {exc}", file=sys.stderr)

        background_tasks.add_task(_bg_eval_draft)

        # 7. Delete draft
        async with httpx.AsyncClient() as client:
            await client.delete(url, headers=headers, params=params, timeout=10.0)

        # 8. Calculate winner side for frontend
        winner_side = None
        if vote_value in ("left", "right"):
            winner_side = vote_value
        elif vote_value in ("model_a", "model_b"):
            if vote_value == "model_a":
                winner_side = "left" if is_left_baseline else "right"
            else:
                winner_side = "right" if is_left_baseline else "left"

        # 9. Restore session to memory store for post-vote chat continuation
        _SESSION_STORE = get_state().session_store
        # Only restore if a winner was selected (left or right)
        if winner_side:
            restored_session = {
                "_ts": time.time(),  # Required for session TTL check
                "prompt": draft.get("prompt", ""),
                "left": {
                    "arm": left_config.get("arm", "baseline"),
                    "model_id": left_config.get("model_id", draft.get("model_a")),
                    "text": draft.get("reply_a", ""),
                    "context": [],  # Initialize empty context for post-vote chat
                },
                "right": {
                    "arm": right_config.get("arm", "strategy"),
                    "model_id": right_config.get("model_id", draft.get("model_b")),
                    "text": draft.get("reply_b", ""),
                    "context": [],  # Initialize empty context for post-vote chat
                },
                "vote_id": vote_id,
                "winner": winner_side,
                "conversation_history": conversation_history,
                "turn_count": turn_count,
                "template_id": model_config.get("template_id"),
                "strategy_name": model_config.get("strategy_name"),
                "base_model_name": draft.get("model_a") or "unknown",
            }
            await _SESSION_STORE.put(session_id, restored_session)
            session_restored = True
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "draft_session_restored",
                "session": session_id,
                "vote_id": vote_id,
                "winner": winner_side,
                "persisted_to_supabase": session_restored,
            }))

        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "draft_vote",
            "session": session_id,
            "vote_id": vote_id,
            "vote": mapped_vote,
        }))

        return JSONResponse({
            "ok": True,
            "vote_id": vote_id,
            "winner_side": winner_side,
        })

    except Exception as e:
        print(f"[ERROR] vote_draft failed: {e}", file=sys.stderr)
        return JSONResponse({"ok": False, "error": "Internal server error"}, status_code=500)


@router.post(f"{API_PREFIX}/draft/{{session_id}}/restore")
async def restore_draft(session_id: str, auth: dict = Depends(require_auth)) -> JSONResponse:
    """Restore a draft conversation to SessionStore for pre-vote continuation.

    This endpoint restores a draft conversation from the database to the in-memory
    SessionStore, allowing users to continue chatting before voting. Unlike vote_draft,
    this does NOT include vote_id or winner fields since the session is pre-vote.
    """
    if not session_id:
        return JSONResponse({"ok": False, "error": "session_id required"}, status_code=400)

    try:
        # 1. Fetch draft from database
        url = f"{SUPABASE_URL}/rest/v1/draft_conversations"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }
        params = {"session_id": f"eq.{session_id}"}

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=10.0)
            if resp.status_code >= 400:
                log_error("draft_restore_fetch_failed", {
                    "session_id": session_id,
                    "status": resp.status_code,
                    "error": resp.text
                }, None)
                return JSONResponse({"ok": False, "error": "Database error"}, status_code=500)
            data = resp.json()
            if not data:
                return JSONResponse(
                    {"ok": False, "error": "Draft not found"},
                    status_code=404,
                    headers={"Cache-Control": "no-store"},
                )

        draft = data[0]

        draft_user_id = draft.get("user_id")
        if draft_user_id and draft_user_id != get_user_id(auth):
            return JSONResponse({"ok": False, "error": "Not found"}, status_code=404, headers={"Cache-Control": "no-store"})

        # 2. Extract draft data and model config
        model_config = draft.get("model_config") or {}
        left_config = model_config.get("left") or {}
        right_config = model_config.get("right") or {}

        # 3. Build session object for SessionStore (pre-vote: no vote_id, no winner)
        conversation_history = draft.get("conversation_history") or []
        turn_count = draft.get("turn_count") or 1

        restored_session = {
            "_ts": time.time(),  # Required for session TTL check
            "prompt": draft.get("prompt", ""),
            "left": {
                "arm": left_config.get("arm", "baseline"),
                "model_id": left_config.get("model_id", draft.get("model_a")),
                "text": draft.get("reply_a", ""),
                "context": [],  # Initialize empty context for continued chat
            },
            "right": {
                "arm": right_config.get("arm", "strategy"),
                "model_id": right_config.get("model_id", draft.get("model_b")),
                "text": draft.get("reply_b", ""),
                "context": [],  # Initialize empty context for continued chat
            },
            # Pre-vote: NO vote_id, NO winner fields
            "conversation_history": conversation_history,
            "turn_count": turn_count,
            "template_id": model_config.get("template_id"),
            "strategy_name": model_config.get("strategy_name"),
            "base_model_name": draft.get("model_a") or "unknown",
        }

        # 4. Restore session to memory store
        _SESSION_STORE = get_state().session_store
        await _SESSION_STORE.put(session_id, restored_session)
        session_restored = True

        # 5. Log successful restoration
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "draft_restored",
            "session": session_id,
            "turn_count": turn_count,
            "persisted_to_supabase": session_restored,
        }))

        return JSONResponse({
            "ok": True,
            "session_id": session_id,
            "turn_count": turn_count,
        })

    except Exception as e:
        log_error("draft_restore_exception", {
            "session_id": session_id,
            "error": str(e),
        }, e)
        print(f"[ERROR] restore_draft failed for session={session_id}: {e}", file=sys.stderr)
        return JSONResponse({"ok": False, "error": "Internal server error"}, status_code=500)


@router.delete(f"{API_PREFIX}/draft/{{session_id}}")
async def delete_draft(session_id: str, auth: dict = Depends(require_auth)) -> JSONResponse:
    """Delete a draft conversation (e.g., after voting)."""
    if not session_id:
        return JSONResponse({"ok": False, "error": "session_id required"}, status_code=400)

    try:
        url = f"{SUPABASE_URL}/rest/v1/draft_conversations"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }
        params = {"session_id": f"eq.{session_id}"}

        async with httpx.AsyncClient() as client:
            # Verify ownership first
            resp = await client.get(url, headers=headers, params=params, timeout=10.0)
            if resp.status_code >= 400:
                return JSONResponse({"ok": False, "error": "Internal server error"}, status_code=500)
            data = resp.json()
            if not data:
                return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)
            draft_user_id = data[0].get("user_id")
            if draft_user_id and draft_user_id != get_user_id(auth):
                return JSONResponse({"ok": False, "error": "Not found"}, status_code=404)

            # Now delete
            resp = await client.delete(url, headers=headers, params=params, timeout=10.0)
            if resp.status_code >= 400:
                return JSONResponse({"ok": False, "error": "Internal server error"}, status_code=500)

        return JSONResponse({"ok": True})
    except Exception as e:
        log_error("draft_delete_exception", {"session_id": session_id}, e)
        return JSONResponse({"ok": False, "error": "Internal server error"}, status_code=500)
