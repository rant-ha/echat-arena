"""DuckDuckGo web search tool for context injection."""

import asyncio
import time
from typing import Dict, List

from arena.config import WEB_SEARCH_MAX_RESULTS, WEB_SEARCH_TIMEOUT_SEC
from arena.utils import log_error

# Module-level rate limiting
_last_search_ts: float = 0.0
_MIN_INTERVAL: float = 1.0


async def search_web(
    query: str,
    max_results: int = WEB_SEARCH_MAX_RESULTS,
    timeout_sec: float = WEB_SEARCH_TIMEOUT_SEC,
) -> List[Dict[str, str]]:
    """DuckDuckGo async search, returns [{title, href, body}, ...].

    - Uses duckduckgo_search.AsyncDDGS
    - asyncio.wait_for timeout protection
    - Module-level rate limiting (>=1s interval)
    - Any exception returns empty list (best-effort)
    """
    global _last_search_ts

    try:
        # Rate limiting
        now = time.monotonic()
        elapsed = now - _last_search_ts
        if elapsed < _MIN_INTERVAL:
            await asyncio.sleep(_MIN_INTERVAL - elapsed)
        _last_search_ts = time.monotonic()

        from duckduckgo_search import AsyncDDGS

        async def _do_search():
            async with AsyncDDGS() as ddgs:
                results = []
                async for r in ddgs.text(query, max_results=max_results):
                    results.append({
                        "title": r.get("title", ""),
                        "href": r.get("href", ""),
                        "body": r.get("body", ""),
                    })
                return results

        return await asyncio.wait_for(_do_search(), timeout=timeout_sec)
    except Exception as exc:
        log_error("web_search_failed", {"query": query[:100]}, exc)
        return []


def format_search_context(query: str, results: List[Dict[str, str]]) -> str:
    """Format search results as LLM context with citation instructions. Empty results return empty string."""
    if not results:
        return ""

    lines = [f'[Web Search Results for "{query}"]', ""]
    for i, r in enumerate(results, 1):
        title = r.get("title", "Untitled")
        href = r.get("href", "")
        body = r.get("body", "")
        lines.append(f"{i}. **{title}** ({href})")
        if body:
            lines.append(f"   {body}")
        lines.append("")

    lines.append(
        "Instructions: Use the above search results to inform your response. "
        "When referencing information from these sources, cite them as inline "
        "markdown links like [source text](URL). Blend citations naturally "
        "into your response."
    )
    return "\n".join(lines)
