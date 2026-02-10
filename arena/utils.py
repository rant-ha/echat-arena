"""Arena utility functions: pure helpers with no business logic."""

import json
import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi.responses import JSONResponse

from arena.config import (
    INJECTION_KEYWORDS,
    MAX_USER_INPUT_LENGTH,
    MIN_USER_INPUT_LENGTH,
)

# Token counting for context management (H-02 fix)
try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False
    print("[WARN] tiktoken not available, using fallback token estimation", file=sys.stderr)


def _utc_now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def log_error(error_type: str, context: dict, exc: Exception = None) -> None:
    """
    统一的错误日志格式（M-05 修复）

    Args:
        error_type: 错误类型标识
        context: 上下文信息字典
        exc: 异常对象（可选）
    """
    import traceback

    log_data = {
        "timestamp": _utc_now_iso(),
        "level": "ERROR",
        "type": error_type,
        "context": context,
    }

    if exc:
        log_data["exception"] = {
            "type": type(exc).__name__,
            "message": str(exc),
            "traceback": traceback.format_exc()
        }

    print(_json_dumps(log_data), file=sys.stderr)


def _count_tokens(text: str, model: str = "gpt-3.5-turbo") -> int:
    """
    计算文本的 Token 数量（H-02 修复）

    Args:
        text: 要计算的文本
        model: 模型名称（用于选择正确的 encoding）

    Returns:
        Token 数量
    """
    if not text:
        return 0

    if TIKTOKEN_AVAILABLE:
        try:
            encoding = tiktoken.encoding_for_model(model)
            return len(encoding.encode(text))
        except Exception:
            # 降级估算：约 4 字符 = 1 token
            return len(text) // 4
    else:
        # 降级估算：约 4 字符 = 1 token
        return len(text) // 4


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _response(data: Any) -> JSONResponse:
    return JSONResponse({"ok": True, "data": data})


def _error(msg: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"ok": False, "error": msg}, status_code=status)


def _validate_user_input(text: str) -> tuple:
    """
    验证用户输入（M-04 修复）

    Args:
        text: 用户输入文本

    Returns:
        (is_valid, error_message): 验证结果和错误信息
    """
    if not text or not text.strip():
        return False, "输入不能为空"

    if len(text) > MAX_USER_INPUT_LENGTH:
        return False, f"输入过长（最多 {MAX_USER_INPUT_LENGTH} 字符）"

    if len(text.strip()) < MIN_USER_INPUT_LENGTH:
        return False, "输入太短"

    # 检查恶意字符（控制字符，但允许换行、回车、制表符）
    if any(ord(c) < 32 and c not in '\n\r\t' for c in text):
        return False, "包含非法字符"

    return True, ""


def _detect_injection_attempt(text: str) -> bool:
    """
    检测 Prompt Injection 尝试（M-07 修复）

    Args:
        text: 用户输入文本

    Returns:
        bool: 是否检测到注入尝试
    """
    text_lower = text.lower()
    return any(keyword in text_lower for keyword in INJECTION_KEYWORDS)


def _strip_think(text: str) -> str:
    # remove <think>...</think> blocks if any
    return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()


def _strip_markdown_code_fences(text: str) -> str:
    # remove markdown code fences for JSON parsing
    return re.sub(r"```(?:json)?\s*([\s\S]*?)```", r"\1", text, flags=re.I).strip()


def _extract_last_json_str(text: str) -> Optional[str]:
    # extract the last {...} block (non-greedy) to match run_experiment.py behavior
    matches = re.findall(r"\{.*?\}", text, flags=re.S)
    if not matches:
        return None
    return matches[-1]


def _extract_first_json(text: str) -> Optional[Dict[str, Any]]:
    # best-effort: find first {...} and parse
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _sse_data(payload: Dict[str, Any]) -> bytes:
    return (f"data: {_json_dumps(payload)}\n\n").encode("utf-8")


def _sse_comment(text: str = "keepalive") -> bytes:
    safe_text = str(text or "keepalive").replace("\n", " ").replace("\r", " ")
    return (f": {safe_text}\n\n").encode("utf-8")


def _parse_last_json_object(raw_text: str) -> Tuple[Optional[Dict[str, Any]], str]:
    """Extract and parse the last JSON object from model output.

    Model outputs may include extra text, markdown code fences, etc.
    Returns (parsed_obj, error_reason). error_reason is "" when success.
    """

    if not isinstance(raw_text, str) or not raw_text.strip():
        return None, "empty output"

    raw = _strip_think(raw_text)

    json_chunk = _extract_last_json_str(raw)
    if not json_chunk:
        sanitized = _strip_markdown_code_fences(raw)
        json_chunk = _extract_last_json_str(sanitized)

    if not json_chunk:
        return None, "no json object found"

    candidates = [json_chunk]
    stripped_candidate = _strip_markdown_code_fences(json_chunk)
    if stripped_candidate and stripped_candidate != json_chunk:
        candidates.append(stripped_candidate)

    last_err: str = "json decode error"
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed, ""
            last_err = "json is not an object"
        except json.JSONDecodeError as exc:
            last_err = f"json decode error: {exc}"
        except Exception as exc:
            last_err = f"json parse error: {exc}"

    return None, last_err


def _coerce_int_1_to_5(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        v = value
    elif isinstance(value, float) and value.is_integer():
        v = int(value)
    elif isinstance(value, str):
        s = value.strip()
        if not re.fullmatch(r"-?\d+", s):
            return None
        try:
            v = int(s)
        except Exception:
            return None
    else:
        return None

    if 1 <= v <= 5:
        return v
    return None
