# arena/session/ — Session Storage Backends

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-10 | Updated: 2026-02-15 -->

## Purpose
Pluggable session store abstraction for managing user conversation state. Three implementations: in-memory (fast, single-dyno), Supabase (persistent, multi-dyno), and HybridSessionStore (Redis L1 cache + Supabase L2 fallback). The HybridStore proxies all methods including admin operations (list_sessions, get_session, soft_delete, restore) with L1 cache invalidation on writes.

## Key Files
| File | Description |
|------|-------------|
| `__init__.py` | Public exports (SessionStore, SupabaseSessionStore) |
| `base.py` | SessionStore abstract class: get, set, delete, list operations |
| `supabase.py` | SupabaseSessionStore: Supabase-backed persistent sessions with TTL |

## For AI Agents

### Working In This Directory
- SessionStore is the interface; implementations must provide: get(), set(), delete(), list().
- Session data is a dict: {id, user_id, messages: [{role, content}], model_a, model_b, created_at, ...}.
- Async operations: use await get/set/delete (both implementations are async-compatible).
- TTL support: in-memory has TTL cache; Supabase uses database TTL or periodic cleanup.
- Fallback strategy: app can fall back from Supabase to in-memory if connection fails.

### Testing Requirements
- In-memory store: create session, set data, retrieve, verify data matches.
- Supabase store: connect to test DB, perform CRUD operations, verify rows exist.
- TTL expiry: set session with TTL, wait, verify it's expired/removed.
- Concurrent access: verify atomicity (no race conditions with simultaneous reads/writes).

### Common Patterns
- Session ID: UUID generated per user session; stable across request/response cycles.
- Messages format: {role: "user"|"assistant", content: "..."}; append new turns.
- Initialization: app startup chooses store backend based on ARENA_SESSION_STORE env var.
- Fallback: if Supabase init fails, use in-memory store (configured in main.py startup event).

## Dependencies

### Internal
- `arena.config` — Supabase credentials, TTL settings
- `arena.utils` — JSON serialization, logging

### External
- **httpx** — Async HTTP for Supabase (if Supabase-backed operations need raw REST calls)
- **Supabase** — PostgreSQL backend (via REST API in supabase.py)
