"""Arena emotion classifier: context-aware classification pipeline."""

import asyncio
import json
import sys
from typing import Any, Dict, List, Optional, Tuple

from arena.config import (
    ALLOWED_EMOTIONS,
    ALLOWED_INTENSITIES,
    ALLOWED_SUPPORT_TYPES,
    CLASSIFICATION_ERROR,
    CLASSIFY_TIMEOUT_SEC,
    EMOTION_MODEL_ID,
    NEUTRAL_INTENSITY,
)
from arena.llm import _chat_completion_text
from arena.models import _get_endpoint
from arena.prompts import CLASSIFIER_SYSTEM_PROMPT
from arena.utils import (
    _count_tokens,
    _extract_last_json_str,
    _json_dumps,
    _strip_markdown_code_fences,
    _strip_think,
    _utc_now_iso,
    log_error,
)


def _build_context_aware_classification_input(
    prompt: str,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    *,
    max_context_tokens: int = 4096,
    reserved_tokens: int = 1000,
    model: str = "gpt-3.5-turbo",
) -> str:
    """Build classifier input that includes full conversation context.

    Subtask B requirements:
    - Historical context must include: user + reply_a + reply_b for every previous turn
    - Append current user input
    - If over token budget, truncate from the oldest turns (reuse existing token counting logic)
    """

    original_history: List[Dict[str, Any]] = list(conversation_history or [])

    def _render(hist: List[Dict[str, Any]]) -> str:
        if not hist:
            return f"用户输入：{prompt}\n请直接输出 JSON。"

        parts: List[str] = ["对话历史：\n"]
        for i, turn in enumerate(hist, 1):
            user_msg = str(turn.get("user", "") or "")
            reply_a = str(turn.get("reply_a", "") or "")
            reply_b = str(turn.get("reply_b", "") or "")

            parts.append(f"第 {i} 轮：")
            parts.append(f"用户：{user_msg}")
            parts.append(f"助手A：{reply_a}")
            parts.append(f"助手B：{reply_b}\n")

        parts.append(f"\n当前用户输入：{prompt}\n")
        parts.append("请基于完整对话历史（包含用户消息与两侧模型回复），综合判断用户当前的情绪状态，直接输出 JSON。")
        return "\n".join(parts)

    history = original_history
    full_prompt = _render(history)
    total_tokens = _count_tokens(full_prompt, model=model)

    truncated = False
    while total_tokens > (max_context_tokens - reserved_tokens) and len(history) > 0:
        truncated = True
        history = history[1:]
        full_prompt = _render(history)
        total_tokens = _count_tokens(full_prompt, model=model)

    if truncated:
        print(
            _json_dumps(
                {
                    "t": _utc_now_iso(),
                    "type": "classifier_history_truncated",
                    "history_len": len(original_history),
                    "remaining_turns": len(history),
                    "tokens": total_tokens,
                }
            ),
            file=sys.stderr,
        )

    return full_prompt


async def _classify_emotion(prompt: str, conversation_history: Optional[List[Dict[str, Any]]] = None) -> Dict[str, str]:
    """Classify emotion/intensity/support_type with full conversation context.

    Strictly aligned with classify_emotion_async() in run_experiment.py:
    - Use CLASSIFIER_SYSTEM_PROMPT
    - Extract the last JSON object (may include extra text/code fences)
    - Validate enums strictly
    - If emotion == neutral, force intensity == medium
    - Any parse/validation failure => MODEL_ERROR (CLASSIFICATION_ERROR)

    Args:
        prompt: Current user input
        conversation_history: Optional list of previous turns for context-aware classification
    """

    endpoint = _get_endpoint(EMOTION_MODEL_ID)

    # Build context-aware prompt (must include user + reply_a + reply_b for all previous turns)
    full_prompt = _build_context_aware_classification_input(
        prompt,
        conversation_history=conversation_history,
        model=endpoint.model_name,
    )

    raw = await _chat_completion_text(
        endpoint,
        messages=[
            {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
            {"role": "user", "content": full_prompt},
        ],
        temperature=0.0,
    )

    raw = _strip_think(raw)

    default = {
        "emotion": CLASSIFICATION_ERROR,
        "intensity": CLASSIFICATION_ERROR,
        "support_type": CLASSIFICATION_ERROR,
    }

    json_chunk = _extract_last_json_str(raw)
    if not json_chunk:
        sanitized = _strip_markdown_code_fences(raw)
        json_chunk = _extract_last_json_str(sanitized)
    if not json_chunk:
        return default

    parsed: Optional[Dict[str, Any]] = None
    candidates = [json_chunk]
    stripped_candidate = _strip_markdown_code_fences(json_chunk)
    if stripped_candidate and stripped_candidate != json_chunk:
        candidates.append(stripped_candidate)

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            break
        except json.JSONDecodeError:
            parsed = None

    if parsed is None:
        return default

    emotion = str(parsed.get("emotion", CLASSIFICATION_ERROR)).lower()
    intensity = str(parsed.get("intensity", CLASSIFICATION_ERROR)).lower()
    support_type = str(parsed.get("support_type", CLASSIFICATION_ERROR)).lower()

    if emotion not in ALLOWED_EMOTIONS:
        return default
    if intensity not in ALLOWED_INTENSITIES:
        return default
    if support_type not in ALLOWED_SUPPORT_TYPES:
        return default

    if emotion == "neutral":
        intensity = NEUTRAL_INTENSITY

    out = {
        "emotion": emotion,
        "intensity": intensity,
        "support_type": support_type,
    }

    # Optional field (API contract: only add fields)
    comment = parsed.get("comment")
    if isinstance(comment, str) and comment.strip():
        out["comment"] = comment.strip()

    return out


async def _safe_classify_emotion(
    prompt: str,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    *,
    timeout_sec: Optional[float] = None,
    log_context: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, str], bool]:
    """Classify emotion with timeout and error isolation.

    Returns:
        (classifier, failed)
    """
    if timeout_sec is None:
        timeout_sec = CLASSIFY_TIMEOUT_SEC

    default: Dict[str, str] = {
        "emotion": CLASSIFICATION_ERROR,
        "intensity": CLASSIFICATION_ERROR,
        "support_type": CLASSIFICATION_ERROR,
    }

    try:
        classifier = await asyncio.wait_for(
            _classify_emotion(prompt, conversation_history=conversation_history),
            timeout=timeout_sec,
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        log_error(
            error_type="emotion_classification_timeout_or_error",
            context={
                "timeout_sec": timeout_sec,
                **(log_context or {}),
            },
            exc=exc,
        )
        return default, True

    emo = str(classifier.get("emotion", CLASSIFICATION_ERROR))
    inten = str(classifier.get("intensity", CLASSIFICATION_ERROR))
    stype = str(classifier.get("support_type", CLASSIFICATION_ERROR))
    failed = emo == CLASSIFICATION_ERROR or inten == CLASSIFICATION_ERROR or stype == CLASSIFICATION_ERROR
    return classifier, failed
