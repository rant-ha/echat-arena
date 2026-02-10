"""Battle routes: start a new A/B battle and continue multi-turn conversation."""

import asyncio
import sys
import uuid
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import StreamingResponse

from arena.config import (
    API_PREFIX,
    REPLY_MODEL_NAME, BASELINE_MODEL_ID, EMPATHY_MODEL_ID,
    CLASSIFY_TIMEOUT_SEC, SSE_HEARTBEAT_SEC,
    ALLOWED_EMOTIONS, ALLOWED_INTENSITIES, ALLOWED_SUPPORT_TYPES,
    NEUTRAL_INTENSITY, CLASSIFICATION_ERROR,
)
from arena.utils import (
    _utc_now_iso, _json_dumps, _sse_data, _sse_comment,
    _validate_user_input, _detect_injection_attempt, _count_tokens,
    log_error,
)
from arena.prompts import BASELINE_SAFETY_OVERRIDE, _build_empathy_system_prompt, _select_template
from arena.models import _get_endpoint
from arena.classifier import _safe_classify_emotion
from arena.services.battle import _battle_sse, _generate_stream_for_side
from arena.state import get_state

router = APIRouter()


@router.post(f"{API_PREFIX}/battle")
async def battle(req: Request, body: Dict[str, Any] = Body(...)) -> StreamingResponse:
    prompt = (body.get("prompt") or "").strip()
    model_key = (body.get("model_key") or "").strip() or None  # NEW: user-selected model

    # M-04: Input validation
    is_valid, error_msg = _validate_user_input(prompt)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    # M-07: Prompt injection detection (log warning but allow)
    if _detect_injection_attempt(prompt):
        log_error(
            error_type="injection_attempt_detected",
            context={"endpoint": "/api/arena/battle", "input_preview": prompt[:100]},
            exc=None
        )

    session_id: str = (body.get("session_id") or "").strip() or uuid.uuid4().hex

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    async def event_stream() -> AsyncIterator[bytes]:
        try:
            yield _sse_comment("init")
            async for chunk in _battle_sse(req, prompt, session_id, model_key):
                yield chunk
        except Exception as exc:
            # Phase 8.2: Unified SSE frame schema - error frame
            yield _sse_data({"type": "error", "side": "error", "error": str(exc), "finish": True})

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)


@router.post(f"{API_PREFIX}/continue")
async def continue_battle(req: Request, body: Dict[str, Any] = Body(...)) -> StreamingResponse:
    """
    处理投票前的多轮对话续写。

    请求体：
    {
        "session_id": "uuid",
        "user_message": "用户新输入的问题"
    }

    返回：SSE 流式响应，格式与 /api/arena/battle 相同
    """
    session_id = (body.get("session_id") or "").strip()
    user_message = (body.get("user_message") or "").strip()
    model_key = (body.get("model_key") or "").strip() or None

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
            context={"endpoint": "/api/arena/continue", "session": session_id, "input_preview": user_message[:100]},
            exc=None
        )

    _SESSION_STORE = get_state().session_store

    # Validate session
    sess = await _SESSION_STORE.get(session_id)
    if not sess:
        raise HTTPException(status_code=400, detail="Invalid session")

    # Check if session already voted
    if sess.get("winner") is not None:
        raise HTTPException(status_code=400, detail="Session already voted")

    # Check turn limit (soft warning at >= 5)
    turn_count = await _SESSION_STORE.get_turn_count(session_id)
    should_warn = turn_count >= 5

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    async def event_stream() -> AsyncIterator[bytes]:
        try:
            yield _sse_comment("init")

            # Retrieve conversation history
            history = await _SESSION_STORE.get_conversation_history(session_id)

            # H-02 Fix: Token counting and context management
            MAX_CONTEXT_TOKENS = 4096  # Adjust based on model
            RESERVED_TOKENS = 1000  # Reserve for new response

            # Re-classify emotion for new input with conversation history context
            classifier, _ = await _safe_classify_emotion(
                user_message,
                conversation_history=history,
                timeout_sec=CLASSIFY_TIMEOUT_SEC,
                log_context={"endpoint": "/api/arena/continue", "session": session_id},
            )
            emo = str(classifier.get("emotion", CLASSIFICATION_ERROR))
            inten = str(classifier.get("intensity", CLASSIFICATION_ERROR))
            stype = str(classifier.get("support_type", CLASSIFICATION_ERROR))
            comment = classifier.get("comment")

            # Fallback to safe defaults when classifier fails
            safe_emo = emo if emo in ALLOWED_EMOTIONS else "neutral"
            safe_inten = inten if inten in ALLOWED_INTENSITIES else NEUTRAL_INTENSITY
            safe_stype = stype if stype in ALLOWED_SUPPORT_TYPES else "both"

            # Select template for new emotion
            selected_tpl = _select_template(safe_emo, safe_inten)
            template_id = selected_tpl.get("template_id") if isinstance(selected_tpl, dict) else None
            strategy_name = selected_tpl.get("strategy_name") if isinstance(selected_tpl, dict) else None
            template_snippet = selected_tpl.get("prompt_snippet") if isinstance(selected_tpl, dict) else ""
            if not isinstance(template_snippet, str) or not template_snippet.strip():
                template_snippet = "在没有特定模板时，也请保持共情与安全。"

            empathy_system = _build_empathy_system_prompt(safe_emo, safe_inten, safe_stype, template_snippet)
            baseline_system = "You are a helpful assistant.\n\n" + BASELINE_SAFETY_OVERRIDE

            # Subtask B: persist latest evaluation result for this turn BEFORE generation
            # (so voting always reads the newest values even if generation partially fails)
            await _SESSION_STORE.update(
                session_id,
                {
                    "last_template_id": template_id,
                    "last_strategy_name": strategy_name,
                },
            )

            # Determine which side is baseline/empathy from session
            left = sess.get("left", {})
            right = sess.get("right", {})
            left_arm = left.get("arm", "baseline")
            right_arm = right.get("arm", "empathy")
            left_model_id = left.get("model_id", REPLY_MODEL_NAME or BASELINE_MODEL_ID)
            right_model_id = right.get("model_id", REPLY_MODEL_NAME or EMPATHY_MODEL_ID)

            # 如果提供了 model_key，验证并覆盖两侧模型
            if model_key:
                try:
                    _get_endpoint(model_key)  # 验证模型存在
                    left_model_id = model_key
                    right_model_id = model_key
                except RuntimeError:
                    log_error("invalid_model_key_continue", {"model_key": model_key, "session_id": session_id}, None)
                    # 保持原有模型

            # NEW: Use single-side context isolation from session store
            # Get current session with contexts
            current_session = await _SESSION_STORE.get(session_id)
            if not current_session:
                raise HTTPException(status_code=400, detail="Session not found during context building")

            # Get existing contexts for each side
            left_context = await _SESSION_STORE._build_side_context(current_session, 'left')
            right_context = await _SESSION_STORE._build_side_context(current_session, 'right')

            # H-02 Fix: Token counting and context management with new context structure
            MAX_CONTEXT_TOKENS = 4096  # Adjust based on model
            RESERVED_TOKENS = 1000  # Reserve for new response

            # Count tokens in system prompts
            history_tokens_left = _count_tokens(baseline_system) if left_arm == "baseline" else _count_tokens(empathy_system)
            history_tokens_right = _count_tokens(empathy_system) if right_arm == "empathy" else _count_tokens(baseline_system)

            # Count tokens in existing contexts (excluding system messages which are already counted)
            user_context_tokens_left = sum(_count_tokens(msg["content"]) for msg in left_context[1:])  # Skip system message
            user_context_tokens_right = sum(_count_tokens(msg["content"]) for msg in right_context[1:])  # Skip system message

            history_tokens_left += user_context_tokens_left
            history_tokens_right += user_context_tokens_right

            # Add current message tokens
            current_msg_tokens = _count_tokens(user_message)
            total_tokens_left = history_tokens_left + current_msg_tokens
            total_tokens_right = history_tokens_right + current_msg_tokens

            # Truncate context from the beginning if exceeds limit
            history_truncated = False
            while (total_tokens_left > (MAX_CONTEXT_TOKENS - RESERVED_TOKENS) or
                   total_tokens_right > (MAX_CONTEXT_TOKENS - RESERVED_TOKENS)) and len(left_context) > 1:
                # Remove oldest user-assistant pair from both contexts
                if len(left_context) >= 3:  # At least system + one user-assistant pair
                    removed_left_user = left_context.pop(1)  # Remove user message
                    removed_left_assistant = left_context.pop(1)  # Remove assistant response
                    removed_left_tokens = _count_tokens(removed_left_user["content"]) + _count_tokens(removed_left_assistant["content"])
                    history_tokens_left -= removed_left_tokens

                if len(right_context) >= 3:  # At least system + one user-assistant pair
                    removed_right_user = right_context.pop(1)  # Remove user message
                    removed_right_assistant = right_context.pop(1)  # Remove assistant response
                    removed_right_tokens = _count_tokens(removed_right_user["content"]) + _count_tokens(removed_right_assistant["content"])
                    history_tokens_right -= removed_right_tokens

                total_tokens_left = history_tokens_left + current_msg_tokens
                total_tokens_right = history_tokens_right + current_msg_tokens
                history_truncated = True

                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "history_truncated",
                    "session": session_id,
                    "remaining_left_messages": len(left_context),
                    "remaining_right_messages": len(right_context),
                    "tokens_left": total_tokens_left,
                    "tokens_right": total_tokens_right
                }))

            # Build messages from contexts
            left_messages = left_context.copy()
            right_messages = right_context.copy()

            # Add current user message to both sides
            left_messages.append({"role": "user", "content": user_message})
            right_messages.append({"role": "user", "content": user_message})

            # Phase 8.2: Unified SSE frame schema - meta frame
            meta: Dict[str, Any] = {
                "type": "meta",
                "side": "meta",
                "finish": False,
                "session_id": session_id,
                "left_model": "anonymous_a",
                "right_model": "anonymous_b",
                "emotion": emo,
                "intensity": inten,
                "support_type": stype,
                "ts": _utc_now_iso(),
                "turn": turn_count + 1,
                "tokens_used": max(total_tokens_left, total_tokens_right),
                "history_truncated": history_truncated,
            }
            if isinstance(comment, str) and comment.strip():
                meta["classifier_comment"] = comment.strip()

            yield _sse_data(meta)

            # Send warning if turn count >= 5
            if should_warn:
                yield _sse_data({"type": "warning", "side": "meta", "message": "建议尽快投票"})

            # Stream left/right concurrently
            q: "asyncio.Queue[Tuple[str, Optional[str]]]" = asyncio.Queue()

            left_task = asyncio.create_task(
                _generate_stream_for_side(
                    "left",
                    left_model_id,
                    left_messages,
                    temperature=0.2,
                    out_q=q,
                )
            )
            right_task = asyncio.create_task(
                _generate_stream_for_side(
                    "right",
                    right_model_id,
                    right_messages,
                    temperature=0.2,
                    out_q=q,
                )
            )

            done_sides: Dict[str, bool] = {"left": False, "right": False}
            left_text_parts: List[str] = []
            right_text_parts: List[str] = []

            while not (done_sides["left"] and done_sides["right"]):
                if await req.is_disconnected():
                    break
                try:
                    side, delta = await asyncio.wait_for(q.get(), timeout=SSE_HEARTBEAT_SEC)
                except asyncio.TimeoutError:
                    yield _sse_comment()
                    continue
                if delta is None:
                    done_sides[side] = True
                    # Phase 8.2: Unified SSE frame schema - finish frame
                    yield _sse_data({"type": "finish", "side": side, "finish": True})
                    continue

                if side == "left":
                    left_text_parts.append(delta)
                else:
                    right_text_parts.append(delta)

                # Phase 8.2: Unified SSE frame schema - delta frame
                yield _sse_data({"type": "delta", "side": side, "delta": delta, "finish": False})

            # Finalize buffers
            left_text = "".join(left_text_parts)
            right_text = "".join(right_text_parts)
            try:
                if left_task.done() and not left_text:
                    left_text = left_task.result()
            except Exception:
                pass
            try:
                if right_task.done() and not right_text:
                    right_text = right_task.result()
            except Exception:
                pass

            # H-03 Fix: Handle partial generation failures
            left_finished = bool(left_text and left_text.strip())
            right_finished = bool(right_text and right_text.strip())

            if left_finished and right_finished:
                # Both sides succeeded - H-01 Fix: Retry logic for append_turn
                MAX_APPEND_RETRIES = 3
                append_success = False
                for retry in range(MAX_APPEND_RETRIES):
                    append_success = await _SESSION_STORE.append_turn(
                        session_id, user_message, left_text, right_text
                    )
                    if append_success:
                        break
                    if retry < MAX_APPEND_RETRIES - 1:
                        await asyncio.sleep(0.1)  # Short delay before retry
                        print(_json_dumps({
                            "t": _utc_now_iso(),
                            "type": "append_turn_retry",
                            "session": session_id,
                            "retry": retry + 1
                        }), file=sys.stderr)

                if not append_success:
                    print(_json_dumps({
                        "t": _utc_now_iso(),
                        "type": "append_turn_failed",
                        "session": session_id,
                        "retries": MAX_APPEND_RETRIES
                    }), file=sys.stderr)

                # Update session with latest emotion classification and strategy metadata
                await _SESSION_STORE.update(
                    session_id,
                    {
                        "emotion": emo,
                        "intensity": inten,
                        "support_type": stype,
                        "classifier_comment": comment.strip() if isinstance(comment, str) else None,
                        "last_template_id": template_id,
                        "last_strategy_name": strategy_name,
                    }
                )

                # Log successful turn
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "continue_turn",
                    "session": session_id,
                    "turn": turn_count + 1,
                    "emotion": emo,
                }))
            elif left_finished or right_finished:
                # H-03 Fix: Partial success - use fallback message for failed side
                fallback_msg = "[生成失败，请重试]"
                final_left = left_text if left_finished else fallback_msg
                final_right = right_text if right_finished else fallback_msg

                # Still append to history with fallback message
                MAX_APPEND_RETRIES = 3
                append_success = False
                for retry in range(MAX_APPEND_RETRIES):
                    append_success = await _SESSION_STORE.append_turn(
                        session_id, user_message, final_left, final_right
                    )
                    if append_success:
                        break
                    if retry < MAX_APPEND_RETRIES - 1:
                        await asyncio.sleep(0.1)

                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "continue_partial_failure",
                    "session": session_id,
                    "left_success": left_finished,
                    "right_success": right_finished
                }), file=sys.stderr)
            else:
                # Both sides failed - do not append to history
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "continue_both_failed",
                    "session": session_id,
                }), file=sys.stderr)

        except Exception as exc:
            # Phase 8.2: Unified SSE frame schema - error frame
            yield _sse_data({"type": "error", "side": "error", "error": str(exc), "finish": True})
            print(_json_dumps({
                "t": _utc_now_iso(),
                "type": "continue_exception",
                "session": session_id,
                "error": str(exc),
            }), file=sys.stderr)

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)
