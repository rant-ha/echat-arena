"""Web search tool via Serper.dev Google Search API with LLM query refinement."""

import asyncio
import sys
from typing import Dict, List

import httpx

from arena.config import (
    EMOTION_MODEL_ID,
    SEARCH_QUERY_MODEL,
    SEARCH_QUERY_REFINE_TIMEOUT_SEC,
    SERPER_API_KEY,
    SERPER_GL,
    SERPER_HL,
    WEB_SEARCH_MAX_RESULTS,
    WEB_SEARCH_TIMEOUT_SEC,
)
from arena.utils import log_error

_SERPER_URL = "https://google.serper.dev/search"
_warned_no_key = False


async def _refine_query(raw_query: str) -> str:
    """Use LLM to extract concise search keywords from user message.

    Best-effort: returns raw_query on any failure.
    Note: _chat_completion_text internally uses _http_post_json_with_retries
    (MAX_RETRIES=3, exponential backoff). The asyncio.wait_for will cancel
    mid-retry if the LLM is slow, which is by design.
    """
    model_id = SEARCH_QUERY_MODEL or EMOTION_MODEL_ID
    if not model_id:
        return raw_query

    try:
        from arena.llm import _chat_completion_text
        from arena.models import _get_endpoint
        from arena.prompts import SEARCH_QUERY_REFINE_PROMPT

        endpoint = _get_endpoint(model_id)
        refined = await asyncio.wait_for(
            _chat_completion_text(
                endpoint,
                messages=[
                    {"role": "system", "content": SEARCH_QUERY_REFINE_PROMPT},
                    {"role": "user", "content": raw_query},
                ],
                temperature=0.0,
            ),
            timeout=SEARCH_QUERY_REFINE_TIMEOUT_SEC,
        )
        refined = refined.strip()
        if refined:
            return refined
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        log_error("search_query_refine_failed", {"query": raw_query[:100]}, exc)

    return raw_query


async def _serper_search(query: str, max_results: int) -> List[Dict[str, str]]:
    """Call Serper.dev API. No independent timeout — caller manages via asyncio.wait_for."""
    global _warned_no_key

    if not SERPER_API_KEY:
        if not _warned_no_key:
            print(
                '{"level":"WARN","type":"serper_no_api_key","msg":"SERPER_API_KEY not set, skipping web search"}',
                file=sys.stderr,
            )
            _warned_no_key = True
        return []

    headers = {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
    }
    payload: Dict = {"q": query, "num": min(max_results, 100)}
    if SERPER_GL:
        payload["gl"] = SERPER_GL
    if SERPER_HL:
        payload["hl"] = SERPER_HL

    from arena.llm import _http_post_json_with_retries
    from arena.config import REQUEST_TIMEOUT

    async with httpx.AsyncClient() as client:
        resp = await _http_post_json_with_retries(
            client, _SERPER_URL, headers, payload, timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Serper API error {resp.status_code}: {resp.text[:200]}")

        data = resp.json()

    return [
        {
            "title": item.get("title", ""),
            "href": item.get("link", ""),
            "body": item.get("snippet", ""),
        }
        for item in data.get("organic", [])
    ]


async def search_web(
    query: str,
    max_results: int = WEB_SEARCH_MAX_RESULTS,
    timeout_sec: float = WEB_SEARCH_TIMEOUT_SEC,
) -> List[Dict[str, str]]:
    """Search the web via Serper.dev with LLM query refinement.

    Pipeline: LLM refine query -> Serper.dev search -> map to {title, href, body}.
    Outer asyncio.wait_for(timeout_sec) manages the entire pipeline budget.
    Any exception returns empty list (best-effort).
    """
    try:
        async def _pipeline():
            refined = await _refine_query(query)
            return await _serper_search(refined, max_results)

        return await asyncio.wait_for(_pipeline(), timeout=timeout_sec)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        log_error("web_search_failed", {"query": query[:100]}, exc)
        return []


def format_search_context(query: str, results: List[Dict[str, str]]) -> str:
    """Format search results as LLM context with citation instructions.

    Empty results return empty string.
    """
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
