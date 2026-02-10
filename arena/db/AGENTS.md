# arena/db/ — Supabase Database Layer

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-10 -->

## Purpose
Async Supabase (PostgreSQL via REST API) operations for vote lifecycle and post-vote chat persistence. Handles vote insertion/update/patching, session-based vote lookup, and post-vote turn storage. Includes retry logic, error detection (unique violations), and JSON deserialization helpers.

## Key Files
| File | Description |
|------|-------------|
| `__init__.py` | Public API exports (vote, post_vote, helpers functions) |
| `helpers.py` | Utility functions: unique violation detection, JSON parsing |
| `votes.py` | Vote CRUD: insert, update, patch, fetch by session_id, fetch all votes |
| `post_vote.py` | Post-vote turn operations: insert and fetch turns after voting |

## For AI Agents

### Working In This Directory
- All functions are async; use `await` in routes/services.
- Supabase URL and auth key from config.py; never hardcode.
- Retry logic in llm.py's _http_post_json_with_retries; reuse for consistency.
- Idempotency: session_id is unique per vote; detect duplicates via _looks_like_unique_violation.
- JSON fields: vote payloads (left/right responses), post_vote turns (conversation history) stored as JSON columns in Supabase.

### Testing Requirements
- Unit: mock httpx responses; test error detection (400, 409 with unique constraint messages).
- Integration: connect to test Supabase DB; verify inserts, updates, fetches.
- Schema validation: ensure votes table has (id, session_id, ...) and post_vote_turns has (vote_id, turn_number, ...).

### Common Patterns
- Detect unique violations: check response status (400, 409) and text for "23505" or "unique" keywords.
- JSON serialization: use arena.utils._json_dumps for consistent encoding.
- Async retries: exponential backoff with random jitter (BACKOFF_BASE, MAX_RETRIES from config).
- PostgREST REST API: POST /rest/v1/{table}, GET with ?select=, PATCH for updates.

## Dependencies

### Internal
- `arena.config` — Supabase credentials, timeout, retry settings
- `arena.llm` — _http_post_json_with_retries (shared retry logic)
- `arena.utils` — _json_dumps, log_error

### External
- **httpx** — Async HTTP client for Supabase REST API
- **Supabase** — PostgreSQL backend (not SDK, raw HTTP)
