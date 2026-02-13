# arena/routes/ — Public and Admin API Endpoints

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-10 -->

## Purpose
FastAPI routers for user-facing and admin-facing endpoints. User routes: battle (A/B conversation), vote (submit evaluation), chat (post-vote continuation), drafts (template browsing), sessions (session query), config (model list). Admin routes: auth (JWT login), models (list/activate models), users (manage user data), stats (arena metrics), archive (trigger CSV export).

## Key Files
| File | Description |
|------|-------------|
| `__init__.py` | Module marker (empty) |
| `health.py` | GET /api/arena/health — liveness probe |
| `config_routes.py` | GET /api/arena/models — list available models |
| `battle.py` | POST /api/arena/battle — start new A/B battle (SSE streaming) |
| `vote.py` | POST /api/arena/vote — submit vote and AI evaluation |
| `chat.py` | POST /api/arena/chat — post-vote continuation chat (SSE streaming) |
| `drafts.py` | Draft CRUD: save, list, get, vote-on-draft, delete |
| `sessions.py` | Session management: list, soft-delete, restore, cleanup |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `admin/` | Protected admin routes (JWT required) |

## For AI Agents

### Working In This Directory
- All routes use `APIRouter` and must be registered in main.py's `create_app()`.
- Type hints required: use Pydantic models or Dict[str, Any] with explicit validation.
- Async endpoints: use `async def` and `await` for I/O (Supabase, LLM calls, classification).
- SSE streaming: return StreamingResponse with body=event_stream (see battle.py, chat.py).
- Error responses: use utils._error for structured JSON errors.
- Admin routes: check JWT token in Authorization header (see admin/auth.py).

### Testing Requirements
- Health check: `curl http://localhost:8000/api/arena/health` → 200 OK.
- Models list: `curl http://localhost:8000/api/arena/models` → JSON array.
- Battle SSE: POST battle with session_id, user_input → stream event IDs, chat tokens, emotion classification.
- Vote: POST vote with session_id, vote value → return vote ID and AI evaluation.
- Chat SSE: POST chat with session_id, user_message → stream winner's next response.
- Admin: POST /admin/auth/login with password → JWT token; use token in admin routes.

### Common Patterns
- Request body validation: extract and strip whitespace (see vote.py, chat.py).
- Session lookup: use state.session_store.get(session_id).
- Emotion classification: run async with timeout to avoid blocking SSE headers.
- SSE events: event type (data, metadata), JSON payload, keep-alive comments.
- Admin auth: decode JWT token from Authorization header; check expiry and signature.

## Dependencies

### Internal
- `arena.config` — Model IDs, API settings, timeouts
- `arena.services` — battle, chat, reconstruction business logic
- `arena.db` — vote and post_vote operations
- `arena.state` — session store access
- `arena.utils` — response formatting, validation, token counting
- `arena.models` — endpoint configuration
- `arena.classifier` — emotion classification
- `arena.evaluator` — AI vote judgment
- `arena.prompts` — system prompt templates
- `arena.llm` — LLM streaming

### External
- **FastAPI** — APIRouter, HTTPException, Request, Body, BackgroundTasks
- **httpx** — Async HTTP (if needed in routes directly, else via services)
