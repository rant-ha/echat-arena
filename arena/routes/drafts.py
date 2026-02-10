"""Draft conversation CRUD routes."""

import sys
import time
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, BackgroundTasks, Body, Query
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

router = APIRouter()


@router.post(f"{API_PREFIX}/draft")
async def save_draft(body: Dict[str, Any] = Body(...)) -> JSONResponse:
    """Save or update a draft conversation (unvoted)."""
    session_id = (body.get("session_id") or "").strip()
    if not session_id:
        return JSONResponse({"ok": False, "error": "session_id required"}, status_code=400)

    user_id = body.get("user_id")
    user_email = body.get("user_email")
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
                        return JSONResponse({"ok": True, "session_id": session_id})
                return JSONResponse({"ok": False, "error": f"Database error: {resp.text}"}, status_code=500)

        return JSONResponse({"ok": True, "session_id": session_id})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@router.get(f"{API_PREFIX}/drafts")
async def get_drafts(user_id: str = Query(None), user_email: str = Query(None)) -> JSONResponse:
    """Get list of draft conversations for a user."""
    if not user_id and not user_email:
        return JSONResponse({"ok": False, "error": "user_id or user_email required"}, status_code=400)

    try:
        url = f"{SUPABASE_URL}/rest/v1/draft_conversations"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }

        params = {"select": "*", "order": "updated_at.desc", "limit": "50"}
        if user_id:
            params["user_id"] = f"eq.{user_id}"
        elif user_email:
            params["user_email"] = f"eq.{user_email}"

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, params=params, timeout=10.0)
            if resp.status_code >= 400:
                return JSONResponse({"ok": False, "error": f"Database error: {resp.text}"}, status_code=500)

            data = resp.json()

        return JSONResponse({"ok": True, "drafts": data})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@router.get(f"{API_PREFIX}/draft/{{session_id}}")
async def get_single_draft(session_id: str) -> JSONResponse:
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

        return JSONResponse({"ok": True, "draft": data[0]})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@router.post(f"{API_PREFIX}/draft/{{session_id}}/vote")
async def vote_draft(session_id: str, body: Dict[str, Any] = Body(...), background_tasks: BackgroundTasks = BackgroundTasks()) -> JSONResponse:
    """Vote on a draft conversation (for resumed/expired sessions).

    This endpoint handles voting when the original session has expired from memory.
    It reads draft data from the database and creates a vote record.
    """
    if not session_id:
        return JSONResponse({"ok": False, "error": "session_id required"}, status_code=400)

    vote_value = (body.get("vote") or "").strip()
    if vote_value not in ALLOWED_VOTES:
        return JSONResponse({"ok": False, "error": "invalid vote"}, status_code=400)

    user_id = body.get("user_id")
    user_email = body.get("user_email")

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
            session_restored = await _SESSION_STORE.put_or_update(session_id, restored_session)
            if not session_restored:
                log_error("draft_session_restore_failed", {
                    "session_id": session_id,
                    "vote_id": str(vote_id)
                }, None)
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
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@router.delete(f"{API_PREFIX}/draft/{{session_id}}")
async def delete_draft(session_id: str) -> JSONResponse:
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
            resp = await client.delete(url, headers=headers, params=params, timeout=10.0)
            if resp.status_code >= 400:
                return JSONResponse({"ok": False, "error": f"Database error: {resp.text}"}, status_code=500)

        return JSONResponse({"ok": True})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
