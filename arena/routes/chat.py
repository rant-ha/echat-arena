"""Post-vote chat routes."""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from arena.config import API_PREFIX
from arena.utils import _response, _error, _validate_user_input, _detect_injection_attempt, log_error
from arena.db.votes import _fetch_vote_record
from arena.db.post_vote import _fetch_post_vote_turns_supabase
from arena.services.reconstruction import _reconstruct_session_from_votes
from arena.services.chat import build_post_vote_context, post_vote_event_stream
from arena.state import get_state

router = APIRouter()


@router.post(f"{API_PREFIX}/chat")
async def post_vote_chat(req: Request, body: Dict[str, Any] = Body(...)) -> StreamingResponse:
    """
    Phase 8.2: 投票后继续对话端点（统一接口契约）

    请求体（向后兼容）：
    {
        "session_id": "uuid",
        "user_message": "用户新输入的问题"  // preferred
        // 或 "prompt": "..."  // deprecated, for backward compatibility
    }

    返回：SSE 流式响应，统一 frame schema
    - meta: {"type": "meta", "side": "winner", ...}
    - delta: {"type": "delta", "side": "winner", "delta": "...", "finish": false}
    - finish: {"type": "finish", "side": "winner", "finish": true}
    - error: {"type": "error", "side": "error", "error": "...", "finish": true}
    """
    session_id = (body.get("session_id") or "").strip()
    # Phase 8.2: Accept both user_message (preferred) and prompt (deprecated)
    user_message = (body.get("user_message") or body.get("prompt") or "").strip()
    # Accept optional vote_id for direct lookup (avoids session reconstruction)
    req_vote_id = (body.get("vote_id") or "").strip()

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    # M-04: Input validation
    is_valid, error_msg = _validate_user_input(user_message)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    # M-07: Prompt injection detection (log warning but allow)
    if _detect_injection_attempt(user_message):
        log_error(
            error_type="injection_attempt_detected",
            context={"endpoint": "/api/arena/chat", "session": session_id, "input_preview": user_message[:100]},
            exc=None
        )

    # Validate session - try vote_id direct lookup first, then session store, then reconstruct
    sess = None
    if req_vote_id:
        # Direct vote_id path: fetch vote record and build minimal session
        vote_record = await _fetch_vote_record(req_vote_id)
        if vote_record and vote_record.get("session_id") == session_id:
            model_config = vote_record.get("model_config") or {}
            left_config = model_config.get("left", {})
            right_config = model_config.get("right", {})
            user_vote = vote_record.get("user_vote")
            is_left_baseline = left_config.get("arm") == "baseline"

            if user_vote == "model_a":
                winner = "left" if is_left_baseline else "right"
            elif user_vote == "model_b":
                winner = "right" if is_left_baseline else "left"
            elif user_vote in ("left", "right"):
                winner = user_vote
            else:
                winner = None

            sess = {
                "session_id": session_id,
                "vote_id": req_vote_id,
                "winner": winner,
                "left": {
                    "arm": left_config.get("arm", "baseline"),
                    "model_id": left_config.get("model_id"),
                },
                "right": {
                    "arm": right_config.get("arm", "empathy"),
                    "model_id": right_config.get("model_id"),
                },
                "conversation_history": vote_record.get("conversation_history", []),
            }

    if not sess:
        sess = await get_state().session_store.get(session_id)
    if not sess:
        # 尝试从数据库重建 session（支持永久对话）
        sess = await _reconstruct_session_from_votes(session_id)
        if not sess:
            raise HTTPException(status_code=404, detail="Vote not found for this session")

    # Check if session has voted (winner must be set)
    winner = sess.get("winner")
    if winner is None:
        raise HTTPException(status_code=400, detail="Must vote before continuing chat")

    # Get vote_id from session
    vote_id = sess.get("vote_id")
    if not vote_id:
        raise HTTPException(status_code=400, detail="vote_id not found; post-vote chat not available")

    # Build context and stream
    ctx = await build_post_vote_context(sess, session_id, user_message)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    return StreamingResponse(
        post_vote_event_stream(ctx, session_id, user_message, req.is_disconnected),
        media_type="text/event-stream",
        headers=headers,
    )


@router.get(f"{API_PREFIX}/chat/history")
async def get_post_vote_chat_history(session_id: str, vote_id: str = "") -> JSONResponse:
    """
    Phase 8.2: 获取投票后对话历史（统一接口契约）

    查询参数：
    - session_id: 会话 ID
    - vote_id: (optional) 投票 ID，提供时直接查询 post_vote_turns

    返回（稳定结构）：
    {
        "ok": true,
        "data": {
            "type": "history",
            "vote_id": "uuid",
            "winner": "left" | "right",
            "winner_side": "left" | "right",
            "turns": [
                {
                    "turn_index": 1,
                    "user_message": "...",
                    "assistant_message": "...",
                    "created_at": "..."
                }
            ],
            "conversation": {
                "prompt": "...",
                "reply_a": "...",
                "reply_b": "...",
                "conversation_history": [...],
                "model_config": {...}
            } | null
        }
    }
    """
    def _history_response(data):
        """Wrap _response with no-store for history endpoint."""
        resp = _response(data)
        resp.headers["Cache-Control"] = "no-store"
        return resp

    def _history_error(msg, status=400):
        resp = _error(msg, status=status)
        resp.headers["Cache-Control"] = "no-store"
        return resp

    if not session_id or not session_id.strip():
        return _history_error("session_id is required")

    session_id = session_id.strip()
    vote_id = (vote_id or "").strip()

    # When vote_id is provided, use it directly for a reliable lookup
    if vote_id:
        # Step 1: Fetch vote record and validate session ownership
        vote_record = await _fetch_vote_record(vote_id)
        if not vote_record:
            return _history_error("not found", status=404)
        vote_session_id = str(vote_record.get("session_id") or "")
        if vote_session_id != session_id:
            return _history_error("not found", status=404)  # 404 not 403 — reduce enumeration surface

        # Step 2: Only after validation, fetch turns
        turns, fetch_error = await _fetch_post_vote_turns_supabase(vote_id)
        formatted_turns = [
            {
                "turn_index": turn.get("turn_index"),
                "user_message": turn.get("user_message"),
                "assistant_message": turn.get("assistant_message"),
                "created_at": turn.get("created_at")
            }
            for turn in turns
        ]

        # Step 3: Determine winner from vote record
        winner = None
        model_config = vote_record.get("model_config") or {}
        left_config = model_config.get("left", {})
        user_vote = vote_record.get("user_vote")
        is_left_baseline = left_config.get("arm") == "baseline"
        if user_vote == "model_a":
            winner = "left" if is_left_baseline else "right"
        elif user_vote == "model_b":
            winner = "right" if is_left_baseline else "left"
        elif user_vote in ("left", "right"):
            winner = user_vote

        resp_data = {
            "type": "history",
            "vote_id": vote_id,
            "winner": winner,
            "winner_side": winner,
            "turns": formatted_turns,
            "conversation": {
                "prompt": vote_record.get("prompt"),
                "reply_a": vote_record.get("reply_a"),
                "reply_b": vote_record.get("reply_b"),
                "conversation_history": vote_record.get("conversation_history", []),
                "model_config": vote_record.get("model_config"),
            },
        }
        if fetch_error:
            resp_data["error_type"] = fetch_error
        return _history_response(resp_data)

    # Fallback: session-based lookup
    sess = await get_state().session_store.get(session_id)
    if not sess:
        sess = await _reconstruct_session_from_votes(session_id)
        if not sess:
            return _history_error("session not found or expired", status=404)

    # Get vote_id and winner from session
    vote_id = sess.get("vote_id")
    winner = sess.get("winner")

    if not vote_id:
        return _history_response({
            "vote_id": None,
            "winner": winner,
            "turns": []
        })

    # Fetch post-vote turns from database
    turns, fetch_error = await _fetch_post_vote_turns_supabase(vote_id)

    # Format response
    formatted_turns = [
        {
            "turn_index": turn.get("turn_index"),
            "user_message": turn.get("user_message"),
            "assistant_message": turn.get("assistant_message"),
            "created_at": turn.get("created_at")
        }
        for turn in turns
    ]

    # Phase 8.2: Add type field for consistent response structure
    vote_record = await _fetch_vote_record(vote_id) if vote_id else None

    resp_data = {
        "type": "history",
        "vote_id": vote_id,
        "winner": winner,
        "winner_side": winner,
        "turns": formatted_turns,
        "conversation": {
            "prompt": vote_record.get("prompt"),
            "reply_a": vote_record.get("reply_a"),
            "reply_b": vote_record.get("reply_b"),
            "conversation_history": vote_record.get("conversation_history", []),
            "model_config": vote_record.get("model_config"),
        } if vote_record else None,
    }
    if fetch_error:
        resp_data["error_type"] = fetch_error
    return _history_response(resp_data)
