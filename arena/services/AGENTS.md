# arena/services/ — Business Logic and Streaming

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-10 | Updated: 2026-02-15 -->

## Purpose
High-level service functions for multi-turn battles, post-vote chat, session reconstruction, and strategy ranking computation. Handles dual-model A/B streaming (left/right SSE), emotion classification coordination, post-vote turn storage, conversation history reconstruction from vote records, and Elo-like rating with statistical significance analysis.

## Key Files
| File | Description |
|------|-------------|
| `__init__.py` | Module marker (empty) |
| `battle.py` | A/B battle SSE streaming: dual-stream generator, queue coordination, emotion classification, token counting |
| `chat.py` | Post-vote chat SSE streaming: context building, winner model continuation, post-vote turn storage |
| `reconstruction.py` | Session reconstruction: rebuild conversation history from vote records and post-vote turns |
| `ranking.py` | Elo-like strategy rating (simplified Bradley-Terry via logistic function) + statistical significance (p-value via normal approximation, Cohen's h effect size, Wilson confidence interval). Pure math — no scipy, no DB, no async. Python 3.9 compatible |

## For AI Agents

### Working In This Directory
- All functions are async; designed for use in FastAPI routes.
- Streaming functions return AsyncIterator[str] (SSE event lines).
- Queues and task coordination: use asyncio.Queue for inter-task communication (battle streams).
- Keep SSE frames small and frequent (send every ~10-20 tokens) to maintain responsiveness.
- Handle client disconnects gracefully: catch asyncio.CancelledError when req.is_disconnected() is true.

### Testing Requirements
- Battle streaming: start battle, verify SSE events (metadata, left tokens, right tokens, emotions, done).
- Chat streaming: post vote, verify SSE events (metadata, winner model continuation, post-vote turn recorded).
- Reconstruction: fetch session history; verify conversation messages and vote records match database state.
- Timeout handling: verify classification timeout (12s default) does not block SSE header emission.
- Token counting: verify token counts match tiktoken estimates.

### Common Patterns
- Asyncio task coordination: use asyncio.gather() or create_task() for parallel model streams.
- SSE events: emit metadata, tokens, classification results, then done event.
- Heartbeat/keep-alive: send comment lines every 25s to prevent Heroku router timeouts.
- Error recovery: catch exceptions, emit error event, close stream gracefully.
- Context building: reconstruct message history from session + latest user input + post-vote history.

## Dependencies

### Internal
- `arena.config` — Model IDs, timeouts, SSE heartbeat interval, emotions/intensities
- `arena.models` — Model endpoint config
- `arena.llm` — _chat_completion_stream, _http_post_json_with_retries
- `arena.classifier` — Emotion classification (sync and async variants)
- `arena.prompts` — System prompts, template selection
- `arena.db` — Vote and post_vote queries
- `arena.utils` — SSE event formatting, token counting, JSON dumps

### External
- **asyncio** — Concurrency primitives (Queue, gather, create_task, TimeoutError)
- **httpx** — Async HTTP for LLM streaming (if not wrapped in llm.py)
