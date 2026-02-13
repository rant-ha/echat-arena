"""Arena evaluator: AI-based empathy scoring."""

from typing import Any, Dict, List, Optional

from arena.config import EVAL_MODEL_ID
from arena.llm import _chat_completion_text
from arena.models import _get_endpoint
from arena.prompts import EVAL_SYSTEM_PROMPT
from arena.utils import _coerce_int_1_to_5, _parse_last_json_object


async def _judge_with_ai(
    prompt: str,
    bot_reply: str,
    conversation_history: Optional[List[Dict]] = None,
    reply_key: str = "reply_a"
) -> Dict[str, Any]:
    """Judge a single reply, aligned with score_reply_with_ai_async() in run_experiment.py.

    Output must be a single JSON object:
    {"empathy_score":1-5,"emotional_safety_score":1-5,"helpfulness_score":1-5,"comment":"..."}

    Fallback: on any parse/validation failure, scores are 0 and comment explains why.

    Args:
        prompt: The initial user prompt
        bot_reply: The bot reply to evaluate
        conversation_history: Optional list of conversation turns, each with 'user', 'reply_a', 'reply_b'
        reply_key: Which reply to use from history ('reply_a' or 'reply_b')
    """

    endpoint = _get_endpoint(EVAL_MODEL_ID)

    # 构建对话上下文
    if conversation_history and len(conversation_history) > 0:
        # 有多轮对话历史 - 构建单一模型的完整对话链
        context_parts = []
        for turn in conversation_history:
            user_msg = turn.get("user", "")
            bot_msg = turn.get(reply_key, "")  # 只取被评估模型的回复
            context_parts.append(f"User: {user_msg}")
            context_parts.append(f"Assistant: {bot_msg}")
        context_str = "\n\n".join(context_parts)

        sys_prompt = (
            EVAL_SYSTEM_PROMPT
            + "\n\n========================\n完整对话历史\n========================\n"
            + context_str
            + "\n\n========================\n当前评估的回复\n========================\n"
            + f'Assistant: "{bot_reply}"\n'
        )
    else:
        # 单轮对话（向后兼容）
        sys_prompt = (
            EVAL_SYSTEM_PROMPT
            + "\n\n========================\n实际对话内容\n========================\n"
            + f'User Input: "{prompt}"\n'
            + f'Bot Reply: "{bot_reply}"\n'
        )

    raw = await _chat_completion_text(
        endpoint,
        messages=[
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": "Evaluate now."},
        ],
        temperature=0.0,
    )

    parsed, err = _parse_last_json_object(raw)
    if parsed is None:
        return {
            "empathy_score": 0,
            "emotional_safety_score": 0,
            "helpfulness_score": 0,
            "comment": f"EVAL_PARSE_FAILED: {err}",
        }

    empathy_score = _coerce_int_1_to_5(parsed.get("empathy_score"))
    emotional_safety_score = _coerce_int_1_to_5(parsed.get("emotional_safety_score"))
    helpfulness_score = _coerce_int_1_to_5(parsed.get("helpfulness_score"))
    comment = parsed.get("comment")

    if empathy_score is None or emotional_safety_score is None or helpfulness_score is None:
        return {
            "empathy_score": 0,
            "emotional_safety_score": 0,
            "helpfulness_score": 0,
            "comment": "EVAL_PARSE_FAILED: score fields must be integers 1-5",
        }

    if not isinstance(comment, str) or not comment.strip():
        comment_text = ""
    else:
        comment_text = comment.strip()

    return {
        "empathy_score": empathy_score,
        "emotional_safety_score": emotional_safety_score,
        "helpfulness_score": helpfulness_score,
        "comment": comment_text,
    }
