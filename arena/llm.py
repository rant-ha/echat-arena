"""Arena LLM client: HTTP helpers and chat completion wrappers."""

import asyncio
import json
import random
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx

from arena.config import BACKOFF_BASE, MAX_RETRIES, REQUEST_TIMEOUT
from arena.models import ModelEndpoint


async def _http_post_json_with_retries(
    client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    json_body: Dict[str, Any],
    timeout: float,
) -> httpx.Response:
    last_exc: Optional[Exception] = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = await client.post(url, headers=headers, json=json_body, timeout=timeout)
            return resp
        except asyncio.CancelledError:
            # Important: allow cancellations (e.g., asyncio.wait_for timeouts) to propagate.
            raise
        except Exception as exc:  # pragma: no cover
            last_exc = exc
            await asyncio.sleep(BACKOFF_BASE * (2**attempt) + random.random() * 0.2)
    raise RuntimeError(f"request failed after retries: {last_exc}")


async def _chat_completion_text(
    endpoint: ModelEndpoint,
    messages: List[Dict[str, str]],
    temperature: float = 0.2,
) -> str:
    url = f"{endpoint.api_base}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {endpoint.api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": endpoint.model_name,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    async with httpx.AsyncClient() as client:
        resp = await _http_post_json_with_retries(client, url, headers, body, timeout=REQUEST_TIMEOUT)
        if resp.status_code >= 400:
            raise RuntimeError(f"chat_completion failed {resp.status_code}: {resp.text}")
        data = resp.json()
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""


async def _chat_completion_stream(
    endpoint: ModelEndpoint,
    messages: List[Dict[str, str]],
    temperature: float = 0.2,
) -> AsyncIterator[str]:
    url = f"{endpoint.api_base}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {endpoint.api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    body = {
        "model": endpoint.model_name,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, headers=headers, json=body, timeout=None) as resp:
            if resp.status_code >= 400:
                raise RuntimeError(f"chat_completion_stream failed {resp.status_code}: {await resp.aread()}")

            async for line in resp.aiter_lines():
                if not line:
                    continue
                if not line.startswith("data:"):
                    continue
                data = line[len("data:") :].strip()
                if data == "[DONE]":
                    break
                try:
                    obj = json.loads(data)
                except Exception:
                    continue
                delta = (
                    (obj.get("choices") or [{}])[0]
                    .get("delta", {})
                    .get("content", "")
                )
                if delta:
                    yield delta
