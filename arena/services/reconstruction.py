"""Session reconstruction from votes table."""

import sys
from typing import Any, Dict, Optional

import httpx

from arena.config import SUPABASE_URL, SUPABASE_SERVICE_KEY


async def _reconstruct_session_from_votes(session_id: str) -> Optional[Dict[str, Any]]:
    """从 votes 表重建 session，支持永久对话。"""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/votes",
                params={"session_id": f"eq.{session_id}", "select": "*", "order": "created_at.desc", "limit": "1"},
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
            )
            if resp.status_code != 200:
                return None

            votes = resp.json()
            if not votes:
                return None

            vote = votes[0]
            model_config = vote.get("model_config") or {}
            left_config = model_config.get("left", {})
            right_config = model_config.get("right", {})

            # 确定 winner side
            user_vote = vote.get("user_vote")
            is_left_baseline = left_config.get("arm") == "baseline"

            if user_vote == "model_a":  # baseline wins
                winner = "left" if is_left_baseline else "right"
            elif user_vote == "model_b":  # strategy wins
                winner = "right" if is_left_baseline else "left"
            elif user_vote in ("left", "right"):  # 直接使用 left/right 投票值
                winner = user_vote
            else:
                winner = None  # tie/both_bad - 不能继续对话

            if not winner:
                return None

            return {
                "session_id": session_id,
                "vote_id": str(vote.get("id")),
                "winner": winner,
                "user_id": vote.get("user_id"),
                "left": {
                    "arm": left_config.get("arm", "baseline"),
                    "model_id": left_config.get("model_id"),
                },
                "right": {
                    "arm": right_config.get("arm", "empathy"),
                    "model_id": right_config.get("model_id"),
                },
                "conversation_history": vote.get("conversation_history", []),
                "last_template_id": model_config.get("template_id") or vote.get("template_id"),
                "last_strategy_name": model_config.get("strategy_name") or vote.get("strategy_name"),
                "_reconstructed": True,
            }
    except Exception as e:
        print(f"Failed to reconstruct session: {e}", file=sys.stderr)
        return None
