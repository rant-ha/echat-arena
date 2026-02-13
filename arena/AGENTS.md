# arena/ — FastAPI Application Package

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-10 -->

## Purpose
Core dual-model A/B testing engine. Orchestrates multi-turn conversations, emotion classification, AI-powered evaluation, vote storage, and post-vote chat continuation. Modularized from monolithic app.py into 36 Python modules across logical subdirectories: routes (7 public endpoints + 5 admin routes), services (battle, chat, reconstruction), db (Supabase queries), session (in-memory and Supabase stores), plus config, models, LLM, classifier, and evaluator.

## Dependency DAG (Import Order)
```
config          -- env vars, constants, JSON loading (NO internal imports)
  |
utils           -- pure helpers (imports config)
  |
models          -- ModelEndpoint dataclass + resolver (imports config)
  |
prompts         -- system prompts, template selection (imports config)
  |
llm             -- HTTP client, chat completion (imports config, models)
  |
  +-- classifier    -- emotion classification (imports config, llm, models, prompts, utils)
  +-- evaluator     -- empathy scoring (imports config, llm, models, prompts, utils)
  |
state           -- AppState singleton (imports session.base)
  |
session/        -- SessionStore implementations (imports config, utils)
  |
db/             -- Supabase CRUD (imports config, llm, utils, db.helpers)
  |
archive         -- CSV export + Google Drive upload (imports config, utils, db)
  |
services/       -- business logic (imports everything above)
  |
routes/         -- FastAPI route handlers (imports services, state, utils, config)
  |
main            -- FastAPI app factory, router assembly, startup hooks
```

**Critical rule**: Never introduce a circular import. Lower layers must not import higher layers.

## Key Files
| File | Description |
|------|-------------|
| `__init__.py` | Package exports (app, APP_VERSION) |
| `config.py` | Environment loading, model IDs, Supabase/Drive/API credentials, constants (emotions, intensities, timeouts) |
| `utils.py` | JSON serialization, SSE events, token counting, input validation, injection detection |
| `models.py` | Model endpoint config parsing |
| `prompts.py` | System prompts, template selection, safety overrides |
| `llm.py` | OpenAI-compatible streaming chat completions with retries |
| `classifier.py` | Emotion classification (async, with timeout fallback) |
| `evaluator.py` | AI-powered vote judge (comparative analysis of battle responses) |
| `state.py` | Global AppState singleton (mutable session store reference) |
| `archive.py` | Optional: Supabase → CSV → Google Drive export job |
| `main.py` | FastAPI app factory; CORS setup, route registration, startup events (session store init, archive job) |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `routes/` | 7 public API routes + 5 admin routes (see routes/AGENTS.md) |
| `db/` | Supabase helpers, vote operations, post-vote turns (see db/AGENTS.md) |
| `services/` | Business logic: battle SSE, post-vote chat, session reconstruction (see services/AGENTS.md) |
| `session/` | Session stores: in-memory and Supabase (see session/AGENTS.md) |

## For AI Agents

### Working In This Directory
- `main.py` is the integration point; all routes must be registered there.
- `config.py` loads all environment variables; never hardcode secrets.
- Model endpoints from api_endpoints.json + env var overrides (via start.sh).
- Async/await throughout; use `asyncio` for concurrency (battle SSE, emotion classification).
- Type hints required (Pydantic models for request/response).

### Testing Requirements
- Unit: `pytest arena/` (requires mocking Supabase, OpenAI API).
- Integration: `uvicorn app:app --reload` + curl test.
- Manual: Start server, create a session, send chat messages, vote, continue post-vote.
- All routes should return structured JSON with `success`, `data`, `error` fields (see utils._response).

### Common Patterns
- SSE streaming for chat/battle responses (Server-Sent Events).
- Emotion classification + vote judging (async, with timeouts to prevent blocking).
- Session-based: one session_id per user session; persists conversation history.
- Database idempotency: use session_id or vote_id as idempotency keys; detect duplicates.
- Error handling: wrap external API calls in try-except; log to stderr with _json_dumps.

## Dependencies

### Internal
- `routes/` (battle, vote, chat, drafts, sessions, config_routes, health, admin/*)
- `services/` (battle, chat, reconstruction)
- `db/` (votes, post_vote, helpers)
- `session/` (SessionStore, SupabaseSessionStore)

### External
- **FastAPI** — Web framework
- **Pydantic** — Request/response validation
- **httpx** — Async HTTP for Supabase REST API
- **openai** — LLM provider SDK (if used, else raw httpx)
- **transformers** — Emotion classifier backbone (optional)
- **tiktoken** — Token counting
- **apscheduler** — Async job scheduling (optional)
