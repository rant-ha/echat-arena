"""Vote route."""

import sys
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Body, Depends
from fastapi.responses import JSONResponse

from arena.config import (
    API_PREFIX,
    REPLY_MODEL_NAME, BASELINE_MODEL_ID,
    ALLOWED_VOTES,
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
)
from arena.utils import _utc_now_iso, _json_dumps, _response, _error, log_error
from arena.evaluator import _judge_with_ai
from arena.db.votes import _insert_vote_supabase, _update_vote_supabase
from arena.archive import _upload_snapshot_to_drive
from arena.state import get_state
from arena.auth import require_auth, get_user_id

router = APIRouter()


@router.post(f"{API_PREFIX}/vote")
async def vote(background_tasks: BackgroundTasks, body: Dict[str, Any] = Body(...), auth: dict = Depends(require_auth)) -> JSONResponse:
    session_id = (body.get("session_id") or "").strip()
    vote_value = (body.get("vote") or "").strip()
    left_model = (body.get("left_model") or "").strip()
    right_model = (body.get("right_model") or "").strip()
    prompt = (body.get("prompt") or "").strip()

    if not session_id:
        return _error("missing fields: session_id")
    if vote_value not in ALLOWED_VOTES:
        return _error("invalid vote")
    if not prompt:
        return _error("missing fields: prompt")
    if not left_model or not right_model:
        return _error("missing fields: left_model,right_model")

    _SESSION_STORE = get_state().session_store
    sess = await _SESSION_STORE.get(session_id)
    if not sess:
        return _error("session not found or expired", status=404)

    # optional user
    user_id = get_user_id(auth)
    user_email = auth.get("email", body.get("user_email"))
    user_tags = body.get("user_tags")
    user_comment = body.get("user_comment")
    client_info = body.get("client_info")

    # Phase 1.3: Retrieve conversation history and turn count for multi-turn support
    conversation_history: List[Dict[str, Any]] = []
    turn_count = 0
    try:
        conversation_history = await _SESSION_STORE.get_conversation_history(session_id)
        turn_count = await _SESSION_STORE.get_turn_count(session_id)
    except Exception as exc:
        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "vote_history_retrieval_warning",
            "session": session_id,
            "error": str(exc),
        }), file=sys.stderr)
        conversation_history = []
        turn_count = 0

    # Normalize turn_count: ensure at least 1 (even for single-turn conversations)
    if turn_count == 0:
        turn_count = 1

    left = sess["left"]
    right = sess["right"]

    # Ensure prompt matches session (best-effort)
    if prompt and sess.get("prompt") and prompt != sess.get("prompt"):
        print(_json_dumps({"t": _utc_now_iso(), "type": "warn", "msg": "prompt mismatch", "session": session_id}))

    # Use cached ai_scores from session if already available; otherwise insert NULL and backfill async
    ai_scores = sess.get("ai_scores")  # may be None

    model_config: Dict[str, Any] = {
        "left": {"arm": left.get("arm"), "model_id": left.get("model_id")},
        "right": {"arm": right.get("arm"), "model_id": right.get("model_id")},
        "template_id": sess.get("template_id"),
        "strategy_name": sess.get("strategy_name"),
        "emotion": sess.get("emotion"),
        "intensity": sess.get("intensity"),
        "support_type": sess.get("support_type"),
    }
    if sess.get("classifier_comment"):
        model_config["classifier_comment"] = sess.get("classifier_comment")

    # Normalize DB columns: A = baseline (control), B = strategy (experiment)
    is_left_baseline = left.get("arm") == "baseline"

    # Map frontend vote values
    if vote_value in ("left", "right"):
        if vote_value == "left":
            mapped_vote = "model_a" if is_left_baseline else "model_b"
        else:
            mapped_vote = "model_b" if is_left_baseline else "model_a"
    else:
        mapped_vote = vote_value

    # Prepare row with baseline/strategy replies placed into reply_a/reply_b
    if is_left_baseline:
        reply_a_text = left.get("text", "")
        reply_b_text = right.get("text", "")
    else:
        reply_a_text = right.get("text", "")
        reply_b_text = left.get("text", "")

    # Enrich model_config with logical A/B labels
    model_config["model_a"] = "baseline"
    model_config["model_b"] = f"strategy_{sess.get('template_id') or 'unknown'}"

    # Priority: last_* (from latest turn) > session root (from first turn)
    template_id = sess.get("last_template_id") or sess.get("template_id") or model_config.get("template_id")
    strategy_name = sess.get("last_strategy_name") or sess.get("strategy_name") or model_config.get("strategy_name")

    # Must NOT write NULL to DB
    if not isinstance(template_id, str):
        template_id = "" if template_id is None else str(template_id)
    template_id = template_id.strip()
    if not template_id:
        print(
            _json_dumps({"t": _utc_now_iso(), "type": "vote_missing_template_id", "session": session_id, "action": "downgrade_to_string"}),
            file=sys.stderr,
        )
        template_id = "unknown_template_id"

    if not isinstance(strategy_name, str):
        strategy_name = "" if strategy_name is None else str(strategy_name)
    strategy_name = strategy_name.strip()
    if not strategy_name:
        print(
            _json_dumps({"t": _utc_now_iso(), "type": "vote_missing_strategy_name", "session": session_id, "action": "downgrade_to_string"}),
            file=sys.stderr,
        )
        strategy_name = "unknown_strategy_name"

    # Log conversation history information before database write
    print(_json_dumps({
        "t": _utc_now_iso(),
        "type": "vote_with_history",
        "session": session_id,
        "turn_count": turn_count,
        "history_length": len(conversation_history),
    }))

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
        "prompt": sess.get("prompt", prompt),
        "reply_a": reply_a_text,
        "reply_b": reply_b_text,
        "model_config": model_config,
        "user_vote": mapped_vote,
        "user_tags": user_tags,
        "user_comment": user_comment,
        "ai_scores": ai_scores,
        "client_info": client_info,
        "base_model_name": sess.get("base_model_name") or (REPLY_MODEL_NAME or BASELINE_MODEL_ID),
        "template_id": template_id,
        "strategy_name": strategy_name,
        "conversation_history": conversation_history,
        "turn_count": turn_count,
        "winner_type": winner_type,
    }

    # stdout log
    print(_json_dumps({"t": _utc_now_iso(), "type": "vote", "payload": {k: row.get(k) for k in ("session_id", "user_id", "user_vote")}}))

    # Insert vote and get vote_id for post-vote chat
    vote_id: Optional[str] = None
    try:
        vote_id = await _insert_vote_supabase(row)
        if vote_id:
            winner_for_session = vote_value
            if vote_value in ("model_a", "model_b"):
                if vote_value == "model_a":
                    winner_for_session = "left" if is_left_baseline else "right"
                else:
                    winner_for_session = "right" if is_left_baseline else "left"

            sess["vote_id"] = vote_id
            sess["winner"] = winner_for_session
            await _SESSION_STORE.update(session_id, {"vote_id": vote_id, "winner": winner_for_session})

            print(_json_dumps({"t": _utc_now_iso(), "type": "vote_id_stored", "session": session_id, "vote_id": vote_id}))
        else:
            print("[WARN] vote_id not returned from Supabase insert", file=sys.stderr)
    except Exception as exc:
        log_error(error_type="vote_insert_failed", context={"session": session_id}, exc=exc)

    # Schedule background evaluation with full conversation context
    async def _bg_eval_and_update() -> None:
        try:
            p = sess.get("prompt", prompt)
            conv_history = sess.get("conversation_history", [])

            if not conv_history:
                try:
                    fresh_sess = await _SESSION_STORE.get(session_id)
                    if fresh_sess:
                        conv_history = fresh_sess.get("conversation_history", [])
                except Exception:
                    conv_history = []

            if is_left_baseline:
                reply_key_a = "reply_a"
                reply_key_b = "reply_b"
            else:
                reply_key_a = "reply_b"
                reply_key_b = "reply_a"

            score_a = await _judge_with_ai(p, reply_a_text, conv_history, reply_key_a)
            score_b = await _judge_with_ai(p, reply_b_text, conv_history, reply_key_b)
            computed_scores = {"model_a": score_a, "model_b": score_b}

            await _SESSION_STORE.update(session_id, {"ai_scores": computed_scores})
            await _update_vote_supabase(session_id, computed_scores)

            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "vote_eval_complete",
                "session": session_id,
                "turn_count": len(conv_history) if conv_history else 1,
                "baseline_position": "left" if is_left_baseline else "right"
            }))
        except Exception as exc:
            print(f"[WARN] vote_eval failed session={session_id}: {exc}", file=sys.stderr)

    background_tasks.add_task(_bg_eval_and_update)

    # Background: upload session snapshot to Drive
    async def _bg_upload_snapshot() -> None:
        try:
            snapshot = {
                "session": sess,
                "vote_row": row,
                "ts": _utc_now_iso(),
            }
            file_id = await _upload_snapshot_to_drive(session_id, snapshot)
            if file_id:
                print(_json_dumps({"t": _utc_now_iso(), "type": "drive_snapshot", "session": session_id, "file_id": file_id}))
        except Exception as exc:
            print(f"[WARN] bg_upload_snapshot failed session={session_id}: {exc}", file=sys.stderr)

    background_tasks.add_task(_bg_upload_snapshot)

    # Background: best-effort delete draft after vote
    async def _bg_delete_draft() -> None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            return
        try:
            draft_url = f"{SUPABASE_URL}/rest/v1/draft_conversations"
            draft_headers = {
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            }
            draft_params = {"session_id": f"eq.{session_id}"}
            async with httpx.AsyncClient() as client:
                await client.delete(draft_url, headers=draft_headers, params=draft_params, timeout=10.0)
        except Exception as exc:
            print(f"[WARN] draft delete after vote failed session={session_id}: {exc}", file=sys.stderr)

    background_tasks.add_task(_bg_delete_draft)

    revealed_left = {"arm": left.get("arm"), "model_id": left.get("model_id")}
    revealed_right = {"arm": right.get("arm"), "model_id": right.get("model_id")}

    return _response(
        {
            "ok": True,
            "session_id": session_id,
            "vote_id": vote_id,
            "revealed_left": revealed_left,
            "revealed_right": revealed_right,
        }
    )
