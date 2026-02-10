"""Post-vote chat service: SSE event_stream generator."""

import asyncio
import os
import random
import sys
from typing import Any, AsyncIterator, Dict, List, Optional

from arena.config import (
    REPLY_MODEL_NAME, BASELINE_MODEL_ID,
    SSE_HEARTBEAT_SEC,
    ALLOWED_EMOTIONS, ALLOWED_INTENSITIES, ALLOWED_SUPPORT_TYPES,
    NEUTRAL_INTENSITY, CLASSIFICATION_ERROR,
)
from arena.utils import (
    _utc_now_iso, _json_dumps, _sse_data, _sse_comment, _count_tokens, log_error,
)
from arena.prompts import (
    BASELINE_SAFETY_OVERRIDE,
    _build_empathy_system_prompt, _select_template,
)
from arena.classifier import _classify_emotion
from arena.db.post_vote import (
    _insert_post_vote_turn_supabase,
    _fetch_post_vote_turns_supabase,
)
from arena.services.battle import _generate_stream_to_queue
from arena.state import get_state


async def build_post_vote_context(
    sess: Dict[str, Any],
    session_id: str,
    user_message: str,
) -> Dict[str, Any]:
    """Build context needed for post-vote chat streaming.

    Returns a dict with all the data the SSE generator needs:
    - winner_side, winner_model_id, vote_id
    - messages (the full LLM messages list)
    - classification results (emo, inten, stype, comment)
    - post_vote_turns (for turn_index calculation)
    - total_tokens
    """
    winner = sess.get("winner")
    vote_id = sess.get("vote_id")

    # Determine winner side and model
    winner_side = winner if winner in ("left", "right") else None
    if not winner_side:
        left = sess.get("left", {})
        winner_side = "left" if left.get("arm") == "empathy" else "right"

    winner_info = sess.get(winner_side, {})
    winner_arm = winner_info.get("arm", "baseline")
    winner_model_id = winner_info.get("model_id", REPLY_MODEL_NAME or BASELINE_MODEL_ID)

    # Build combined history for context-aware classification
    # 1. Get pre-vote conversation history
    if sess.get("_reconstructed"):
        pre_vote_history = sess.get("conversation_history", [])
    else:
        pre_vote_history = await get_state().session_store.get_conversation_history(session_id)

    # 2. Get post-vote conversation history from database (best-effort; never block chat)
    post_vote_turns: List[Dict[str, Any]] = []
    try:
        fetch_timeout_sec = float(os.environ.get("ARENA_POST_VOTE_HISTORY_TIMEOUT_SEC", "5"))
        post_vote_turns, _fetch_err = await asyncio.wait_for(
            _fetch_post_vote_turns_supabase(vote_id),
            timeout=fetch_timeout_sec,
        )
    except Exception as exc:
        log_error(
            error_type="post_vote_turns_fetch_timeout_or_error",
            context={"session": session_id, "vote_id": vote_id},
            exc=exc,
        )
        post_vote_turns = []

    # 3. Combine histories for context-aware classification
    combined_history = []
    for turn in pre_vote_history:
        combined_history.append({
            "user": turn.get("user", ""),
            "reply_a": turn.get("reply_a", ""),
            "reply_b": turn.get("reply_b", "")
        })

    for turn in post_vote_turns:
        assistant_msg = turn.get("assistant_message", "")
        combined_history.append({
            "user": turn.get("user_message", ""),
            "reply_a": assistant_msg,
            "reply_b": assistant_msg
        })

    # Re-classify emotion for new input with full conversation context (best-effort).
    classify_timeout_sec = float(os.environ.get("ARENA_POST_VOTE_CLASSIFY_TIMEOUT_SEC", "12"))
    classification_failed = False

    try:
        classifier = await asyncio.wait_for(
            _classify_emotion(user_message, conversation_history=combined_history),
            timeout=classify_timeout_sec,
        )
        emo = str(classifier.get("emotion", CLASSIFICATION_ERROR))
        inten = str(classifier.get("intensity", CLASSIFICATION_ERROR))
        stype = str(classifier.get("support_type", CLASSIFICATION_ERROR))
        comment = classifier.get("comment")
    except Exception as exc:
        classification_failed = True
        log_error(
            error_type="post_vote_emotion_classification_failed",
            context={
                "session": session_id,
                "vote_id": vote_id,
                "fallback_strategy": "skip_classification",
                "timeout_sec": classify_timeout_sec,
            },
            exc=exc,
        )
        emo = CLASSIFICATION_ERROR
        inten = CLASSIFICATION_ERROR
        stype = CLASSIFICATION_ERROR
        comment = None

    # For internal template selection/prompting, always use safe defaults if classifier failed/invalid.
    if classification_failed:
        safe_emo = "neutral"
        safe_inten = NEUTRAL_INTENSITY
        safe_stype = "both"
    else:
        safe_emo = emo if emo in ALLOWED_EMOTIONS else "neutral"
        safe_inten = inten if inten in ALLOWED_INTENSITIES else NEUTRAL_INTENSITY
        safe_stype = stype if stype in ALLOWED_SUPPORT_TYPES else "both"

    # Build system prompt based on winner arm
    if winner_arm == "empathy":
        selected_tpl = _select_template(safe_emo, safe_inten)
        template_id = selected_tpl.get("template_id") if isinstance(selected_tpl, dict) else None
        strategy_name = selected_tpl.get("strategy_name") if isinstance(selected_tpl, dict) else None
        template_snippet = selected_tpl.get("prompt_snippet") if isinstance(selected_tpl, dict) else ""
        if not isinstance(template_snippet, str) or not template_snippet.strip():
            template_snippet = "在没有特定模板时，也请保持共情与安全。"
        system_prompt = _build_empathy_system_prompt(safe_emo, safe_inten, safe_stype, template_snippet)
    else:
        template_id = None
        strategy_name = None
        system_prompt = "You are a helpful assistant.\n\n" + BASELINE_SAFETY_OVERRIDE

    # Update session with latest strategy metadata
    await get_state().session_store.update(
        session_id,
        {
            "last_template_id": template_id,
            "last_strategy_name": strategy_name,
        }
    )

    # Build messages with conversation history
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    # Append pre-vote history (only winner side replies)
    for turn in pre_vote_history:
        user_msg = turn.get("user", "")
        if winner_side == "left":
            assistant_msg = turn.get("reply_a", "")
        else:
            assistant_msg = turn.get("reply_b", "")
        messages.append({"role": "user", "content": user_msg})
        messages.append({"role": "assistant", "content": assistant_msg})

    # Append post-vote history
    for turn in post_vote_turns:
        messages.append({"role": "user", "content": turn.get("user_message", "")})
        messages.append({"role": "assistant", "content": turn.get("assistant_message", "")})

    # Append current user message
    messages.append({"role": "user", "content": user_message})

    # Token management (H-02 fix)
    MAX_CONTEXT_TOKENS = 4096
    RESERVED_TOKENS = 1000
    total_tokens = sum(_count_tokens(msg["content"]) for msg in messages)

    while total_tokens > (MAX_CONTEXT_TOKENS - RESERVED_TOKENS) and len(messages) > 2:
        messages.pop(1)
        if len(messages) > 1 and messages[1]["role"] == "assistant":
            messages.pop(1)
        total_tokens = sum(_count_tokens(msg["content"]) for msg in messages)

        print(_json_dumps({
            "t": _utc_now_iso(),
            "type": "post_vote_history_truncated",
            "session": session_id,
            "vote_id": vote_id,
            "remaining_messages": len(messages),
            "tokens": total_tokens
        }))

    return {
        "winner_side": winner_side,
        "winner_model_id": winner_model_id,
        "vote_id": vote_id,
        "messages": messages,
        "emo": emo,
        "inten": inten,
        "stype": stype,
        "comment": comment,
        "post_vote_turns": post_vote_turns,
        "total_tokens": total_tokens,
        "user_id": sess.get("user_id"),
    }


async def post_vote_event_stream(
    ctx: Dict[str, Any],
    session_id: str,
    user_message: str,
    is_disconnected,
) -> AsyncIterator[bytes]:
    """SSE event_stream generator for post-vote chat.

    Args:
        ctx: context dict from build_post_vote_context
        session_id: session ID
        user_message: the user's message
        is_disconnected: async callable returning True if client disconnected
    """
    winner_side = ctx["winner_side"]
    winner_model_id = ctx["winner_model_id"]
    vote_id = ctx["vote_id"]
    messages = ctx["messages"]
    emo = ctx["emo"]
    inten = ctx["inten"]
    stype = ctx["stype"]
    comment = ctx["comment"]
    post_vote_turns = ctx["post_vote_turns"]
    total_tokens = ctx["total_tokens"]
    user_id = ctx.get("user_id")

    q: "asyncio.Queue[Optional[str]]" = asyncio.Queue()
    gen_task: Optional[asyncio.Task[str]] = None
    try:
        yield _sse_comment("init")
        # Phase 8.2: Unified SSE frame schema - meta frame
        meta: Dict[str, Any] = {
            "type": "meta",
            "side": winner_side,
            "finish": False,
            "session_id": session_id,
            "vote_id": vote_id,
            "winner_side": winner_side,
            "emotion": emo,
            "intensity": inten,
            "support_type": stype,
            "ts": _utc_now_iso(),
            "turn_index": len(post_vote_turns) + 1,
            "tokens_used": total_tokens,
        }
        if isinstance(comment, str) and comment.strip():
            meta["classifier_comment"] = comment.strip()

        yield _sse_data(meta)

        # Generate response (with heartbeat)
        assistant_text_parts: List[str] = []

        gen_task = asyncio.create_task(
            _generate_stream_to_queue(
                winner_model_id,
                messages,
                temperature=0.2,
                out_q=q,
            )
        )

        while True:
            if await is_disconnected():
                break
            try:
                delta = await asyncio.wait_for(q.get(), timeout=SSE_HEARTBEAT_SEC)
            except asyncio.TimeoutError:
                yield _sse_comment()
                continue
            if delta is None:
                break

            assistant_text_parts.append(delta)
            yield _sse_data({
                "type": "delta",
                "side": winner_side,
                "delta": delta,
                "finish": False
            })

        if await is_disconnected():
            return

        # Ensure any generator exception is retrieved
        assistant_text = await gen_task

        # Write to database (concurrency-safe): retry on UNIQUE(vote_id, turn_index) conflict
        base_turn_index = len(post_vote_turns) + 1

        MAX_TURN_INDEX_RETRIES = 8
        saved_turn_index: Optional[int] = None
        for i in range(MAX_TURN_INDEX_RETRIES):
            candidate = base_turn_index + i
            status = await _insert_post_vote_turn_supabase(
                vote_id=vote_id,
                winner_side=winner_side,
                turn_index=candidate,
                user_message=user_message,
                assistant_message=assistant_text,
                user_id=user_id,
            )
            if status == "ok":
                saved_turn_index = candidate
                break
            if status == "conflict":
                await asyncio.sleep(0.05 + random.random() * 0.05)
                continue
            break

        if saved_turn_index is not None:
            print(
                _json_dumps(
                    {
                        "t": _utc_now_iso(),
                        "type": "post_vote_turn_saved",
                        "session": session_id,
                        "vote_id": vote_id,
                        "turn_index": saved_turn_index,
                    }
                )
            )
        else:
            print(
                _json_dumps(
                    {
                        "t": _utc_now_iso(),
                        "type": "post_vote_turn_save_failed",
                        "session": session_id,
                        "vote_id": vote_id,
                        "turn_index": base_turn_index,
                        "retries": MAX_TURN_INDEX_RETRIES,
                    }
                ),
                file=sys.stderr,
            )

        # Phase 8.2: Unified SSE frame schema - finish frame (sent after DB write)
        yield _sse_data({
            "type": "finish",
            "side": winner_side,
            "saved": saved_turn_index is not None,
            "turn_index": saved_turn_index,
            "finish": True
        })

    except Exception as exc:
        # Phase 8.2: Unified SSE frame schema - error frame
        yield _sse_data({
            "type": "error",
            "side": "error",
            "error": str(exc),
            "finish": True
        })
        log_error(
            error_type="post_vote_chat_exception",
            context={"session": session_id, "vote_id": vote_id},
            exc=exc
        )
    finally:
        if gen_task is not None and not gen_task.done():
            gen_task.cancel()
