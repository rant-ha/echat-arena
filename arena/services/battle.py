"""Battle service: SSE streaming for A/B model comparison."""

import asyncio
import random
import time
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from arena.config import (
    REPLY_MODEL_NAME, BASELINE_MODEL_ID, EMPATHY_MODEL_ID,
    CLASSIFY_TIMEOUT_SEC, SSE_HEARTBEAT_SEC,
    ALLOWED_EMOTIONS, ALLOWED_INTENSITIES, ALLOWED_SUPPORT_TYPES,
    NEUTRAL_INTENSITY, CLASSIFICATION_ERROR,
)
from arena.utils import _utc_now_iso, _json_dumps, _sse_data, _sse_comment, log_error
from arena.prompts import BASELINE_SAFETY_OVERRIDE, _build_empathy_system_prompt, _select_template
from arena.models import _get_endpoint
from arena.llm import _chat_completion_stream
from arena.classifier import _safe_classify_emotion
from arena.state import get_state

from fastapi import Request


async def _generate_stream_for_side(
    side: str,
    model_id: str,
    messages: List[Dict[str, str]],
    temperature: float,
    out_q: "asyncio.Queue[Tuple[str, Optional[str]]]",
) -> str:
    """Generate streaming response for one side with custom messages list.

    Args:
        side: 'left' or 'right'
        model_id: Model identifier
        messages: Complete messages list (system + conversation history + user)
        temperature: Sampling temperature
        out_q: Queue for streaming output

    Returns:
        Complete generated text
    """
    endpoint = _get_endpoint(model_id)

    buf: List[str] = []
    try:
        async for delta in _chat_completion_stream(endpoint, messages, temperature=temperature):
            buf.append(delta)
            await out_q.put((side, delta))
    finally:
        await out_q.put((side, None))
    return "".join(buf)


async def _generate_stream_to_queue(
    model_id: str,
    messages: List[Dict[str, str]],
    temperature: float,
    out_q: "asyncio.Queue[Optional[str]]",
) -> str:
    """Generate a single streaming response and push deltas into a queue.

    Always pushes a final None sentinel.
    """
    endpoint = _get_endpoint(model_id)

    buf: List[str] = []
    try:
        async for delta in _chat_completion_stream(endpoint, messages, temperature=temperature):
            buf.append(delta)
            await out_q.put(delta)
    finally:
        try:
            await asyncio.shield(out_q.put(None))
        except Exception:
            pass
    return "".join(buf)


async def _battle_sse(req: Request, prompt: str, session_id: str, model_key: Optional[str] = None) -> AsyncIterator[bytes]:
    # Controlled single-model A/B: both sides use the same underlying model id
    # Arms denote which system prompt to use: baseline (empty/simple) vs empathy (templated)
    arms = ["baseline", "empathy"]
    random.shuffle(arms)
    left_arm, right_arm = arms[0], arms[1]

    # Resolve model to use: user-selected model_key takes precedence
    base_model_id = REPLY_MODEL_NAME or BASELINE_MODEL_ID or EMPATHY_MODEL_ID

    if model_key:
        try:
            _get_endpoint(model_key)  # Validate model_key exists in config
            base_model_id = model_key
        except RuntimeError:
            log_error("invalid_model_key", {"model_key": model_key, "session": session_id, "fallback": base_model_id}, None)
            # Keep default base_model_id

    left_model_id = base_model_id
    right_model_id = base_model_id

    # 1) emotion classification + template selection for empathy arm
    classifier, _ = await _safe_classify_emotion(
        prompt,
        timeout_sec=CLASSIFY_TIMEOUT_SEC,
        log_context={"endpoint": "/api/arena/battle", "session": session_id},
    )

    # Keep API surface aligned with spec: expose flattened fields.
    emo = str(classifier.get("emotion", CLASSIFICATION_ERROR))
    inten = str(classifier.get("intensity", CLASSIFICATION_ERROR))
    stype = str(classifier.get("support_type", CLASSIFICATION_ERROR))
    comment = classifier.get("comment")

    # For internal template selection/prompting, fall back to safe defaults when classifier fails.
    safe_emo = emo if emo in ALLOWED_EMOTIONS else "neutral"
    safe_inten = inten if inten in ALLOWED_INTENSITIES else NEUTRAL_INTENSITY
    safe_stype = stype if stype in ALLOWED_SUPPORT_TYPES else "both"

    selected_tpl = _select_template(safe_emo, safe_inten)
    template_id = selected_tpl.get("template_id") if isinstance(selected_tpl, dict) else None
    strategy_name = selected_tpl.get("strategy_name") if isinstance(selected_tpl, dict) else None
    template_snippet = selected_tpl.get("prompt_snippet") if isinstance(selected_tpl, dict) else ""

    if not isinstance(template_snippet, str) or not template_snippet.strip():
        template_snippet = "在没有特定模板时，也请保持共情与安全。"

    empathy_system = _build_empathy_system_prompt(safe_emo, safe_inten, safe_stype, template_snippet)

    # 2) send meta frame (anonymous labels for client)
    # Phase 8.2: Unified SSE frame schema
    meta: Dict[str, Any] = {
        "type": "meta",
        "side": "meta",
        "finish": False,
        "session_id": session_id,
        "left_model": "anonymous_a",
        "right_model": "anonymous_b",
        # Optional fields (API contract: only add fields)
        "template_id": template_id,
        "strategy_name": strategy_name,
        "template_emotion": safe_emo,
        "template_intensity": safe_inten,
        # Existing fields
        "emotion": emo,
        "intensity": inten,
        "support_type": stype,
        "ts": _utc_now_iso(),
    }
    if isinstance(comment, str) and comment.strip():
        meta["classifier_comment"] = comment.strip()

    yield _sse_data(meta)

    # 3) stream left/right concurrently into a single SSE channel
    q: "asyncio.Queue[Tuple[str, Optional[str]]]" = asyncio.Queue()

    # Baseline system prompt: simple helper with injection defense
    baseline_system = "You are a helpful assistant.\n\n" + BASELINE_SAFETY_OVERRIDE
    left_system = empathy_system if left_arm == "empathy" else baseline_system
    right_system = empathy_system if right_arm == "empathy" else baseline_system

    # Build messages for initial turn (no conversation history)
    left_messages: List[Dict[str, str]] = []
    if left_system:
        left_messages.append({"role": "system", "content": left_system})
    left_messages.append({"role": "user", "content": prompt})

    right_messages: List[Dict[str, str]] = []
    if right_system:
        right_messages.append({"role": "system", "content": right_system})
    right_messages.append({"role": "user", "content": prompt})

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

    try:
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

    finally:
        if not left_task.done():
            left_task.cancel()
        if not right_task.done():
            right_task.cancel()

    # 4) finalize buffers (best-effort)
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

    # 5) store session record for vote endpoint with single-side context isolation
    _SESSION_STORE = get_state().session_store
    session_data = {
        "_ts": time.time(),
        "session_id": session_id,
        "prompt": prompt,
        "left": {
            "arm": left_arm,
            "model_id": left_model_id,
            "text": left_text,
            "context": [
                {"role": "system", "content": left_system if left_system else "You are a helpful assistant."}
            ]
        },
        "right": {
            "arm": right_arm,
            "model_id": right_model_id,
            "text": right_text,
            "context": [
                {"role": "system", "content": right_system if right_system else "You are a helpful assistant."}
            ]
        },
        "emotion": emo,
        "intensity": inten,
        "support_type": stype,
        "classifier_comment": comment.strip() if isinstance(comment, str) else None,
        "template_id": template_id,
        "strategy_name": strategy_name,
        # Subtask B: keep latest (per-turn) strategy metadata in session
        "last_template_id": template_id,
        "last_strategy_name": strategy_name,
        "ai_scores": None,
        # Record base model name for downstream analysis
        "base_model_name": base_model_id,
        "base_model_key": model_key or base_model_id,  # Track user-selected model
        "created_at": _utc_now_iso(),
        "conversation_history": [],
        "turn_count": 0,
        "version": 0
    }

    await _SESSION_STORE.put(session_id, session_data)

    # Append first turn to conversation history (with context isolation)
    await _SESSION_STORE.append_turn(session_id, prompt, left_text, right_text)

    # NOTE: AI evaluation moved to vote() endpoint for efficiency
    # Evaluation now runs only when user actually votes, with full conversation context
