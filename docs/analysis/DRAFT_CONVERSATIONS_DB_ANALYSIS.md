# Draft Conversations Database Operations Analysis

**Date:** 2026-02-12  
**Scope:** Complete analysis of `draft_conversations` table operations in the arena/ package

---

## Executive Summary

The `draft_conversations` table is used to save unvoted chat sessions, allowing users to resume conversations that weren't voted on. The implementation uses Supabase REST API with HTTP client calls, but has several critical issues:

1. **No dedicated helper functions** - All operations are inline in `arena/routes/drafts.py`
2. **No transaction support** - Each operation is independent HTTP request
3. **Limited error handling** - Basic try/catch with generic error responses
4. **Race condition vulnerabilities** - Concurrent upserts can fail
5. **No circuit breaker usage** - Unlike votes table, drafts don't use circuit breaker
6. **No compensation queue** - Failed writes are lost permanently

---

## 1. Database Helper Functions

### Finding: No Dedicated Helper Functions

**Location:** [arena/routes/drafts.py](arena/routes/drafts.py)

All database operations for `draft_conversations` are implemented inline in the route handlers. There are **no dedicated helper functions** in the `arena/db/` package for draft operations.

**Comparison with votes table:**
- **Votes table:** Has dedicated helpers in [arena/db/votes.py](arena/db/votes.py)
  - `_insert_vote_supabase()`
  - `_update_vote_supabase()`
  - `_fetch_vote_id_by_session_id_supabase()`
  - `_fetch_all_votes_from_supabase()`
  - `_patch_vote_supabase()`
  - `_fetch_vote_record()`

- **Drafts table:** No helper functions, all inline in routes

**Implications:**
- Code duplication across routes
- Inconsistent error handling patterns
- No centralized retry logic
- Harder to test and maintain

---

## 2. Message Insertion into draft_conversations

### 2.1 Primary Insertion Point: `save_draft()` Endpoint

**Location:** [arena/routes/drafts.py#L27-L88](arena/routes/drafts.py#L27-L88)

```python
@router.post(f"{API_PREFIX}/draft")
async def save_draft(body: Dict[str, Any] = Body(...)) -> JSONResponse:
    """Save or update a draft conversation (unvoted)."""
```

**Insertion Flow:**

1. **Extract data from request body:**
   ```python
   session_id = (body.get("session_id") or "").strip()
   user_id = body.get("user_id")
   user_email = body.get("user_email")
   prompt = body.get("prompt", "")
   reply_a = body.get("reply_a", "")
   reply_b = body.get("reply_b", "")
   model_a = body.get("model_a", "")
   model_b = body.get("model_b", "")
   conversation_history = body.get("conversation_history")
   turn_count = body.get("turn_count", 1)
   model_config = body.get("model_config")
   ```

2. **Build row object:**
   ```python
   row = {
       "session_id": session_id,
       "user_id": user_id,
       "user_email": user_email,
       "prompt": prompt,
       "reply_a": reply_a,
       "reply_b": reply_b,
       "model_a": model_a,
       "model_b": model_b,
       "conversation_history": conversation_history,
       "turn_count": turn_count,
       "model_config": model_config,
       "updated_at": _utc_now_iso(),
   }
   ```

3. **Upsert using Supabase REST API:**
   ```python
   url = f"{SUPABASE_URL}/rest/v1/draft_conversations?on_conflict=session_id"
   headers = {
       "apikey": SUPABASE_SERVICE_KEY,
       "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
       "Content-Type": "application/json",
       "Prefer": "resolution=merge-duplicates",
   }
   
   async with httpx.AsyncClient() as client:
       resp = await client.post(url, headers=headers, json=row, timeout=10.0)
   ```

4. **Handle unique violation (race condition fallback):**
   ```python
   if resp.status_code >= 400:
       if _looks_like_unique_violation(resp):
           # Concurrent insert won, fall back to PATCH
           patch_url = f"{SUPABASE_URL}/rest/v1/draft_conversations?session_id=eq.{session_id}"
           patch_headers = {
               "apikey": SUPABASE_SERVICE_KEY,
               "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
               "Content-Type": "application/json",
           }
           resp = await client.patch(patch_url, headers=patch_headers, json=row, timeout=10.0)
   ```

### 2.2 Frontend Call Pattern

**Location:** [web/app/battle/page.tsx#L224-L246](web/app/battle/page.tsx#L224-L246)

```typescript
await fetch("/api/proxy/api/arena/draft", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    session_id: meta.session_id,
    user_id: user?.id,
    user_email: user?.email,
    prompt,
    reply_a: leftText,
    reply_b: rightText,
    model_a: meta.left_model,
    model_b: meta.right_model,
    conversation_history: conversationHistory,
    turn_count: currentTurn,
    model_config: {
      left: { model_id: meta.left_model },
      right: { model_id: meta.right_model },
    },
  }),
});
```

**Key Observations:**
- Frontend calls draft save **after each turn completes**
- Includes full `conversation_history` array
- Includes `turn_count` for tracking conversation length
- Uses `model_config` to store arm assignments (baseline/strategy)

### 2.3 conversation_history Structure

The `conversation_history` field stores an array of turn records:

```python
# From arena/session/base.py - append_turn()
turn_record = {
    "turn": expected_turn,
    "user": user_msg,
    "reply_a": reply_a,
    "reply_b": reply_b,
    "timestamp": _utc_now_iso(),
}
```

**Storage format:** JSONB in PostgreSQL

---

## 3. Schema of draft_conversations Table

**Location:** [migrations/add_draft_conversations.sql](migrations/add_draft_conversations.sql)

```sql
CREATE TABLE IF NOT EXISTS draft_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  prompt TEXT NOT NULL,
  reply_a TEXT NOT NULL,
  reply_b TEXT NOT NULL,
  model_a TEXT NOT NULL,
  model_b TEXT NOT NULL,
  conversation_history JSONB,
  turn_count INT DEFAULT 1,
  model_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.1 Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_draft_user_id ON draft_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_draft_session_id ON draft_conversations(session_id);
```

**Purpose:**
- `idx_draft_user_id`: Efficient user draft list queries
- `idx_draft_session_id`: Fast upsert/delete by session_id

### 3.2 Row Level Security (RLS) Policies

```sql
ALTER TABLE draft_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drafts" ON draft_conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own drafts" ON draft_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts" ON draft_conversations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts" ON draft_conversations
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access" ON draft_conversations
  FOR ALL USING (auth.role() = 'service_role');
```

**Security Model:**
- Users can only access their own drafts
- Backend uses service role key for full access
- RLS enforced at database level

### 3.3 Field Descriptions

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key, auto-generated |
| `session_id` | TEXT UNIQUE | Foreign key to in-memory session |
| `user_id` | UUID | Reference to auth.users table |
| `user_email` | TEXT | User email for fallback queries |
| `prompt` | TEXT | Initial user prompt |
| `reply_a` | TEXT | Left model response |
| `reply_b` | TEXT | Right model response |
| `model_a` | TEXT | Left model identifier |
| `model_b` | TEXT | Right model identifier |
| `conversation_history` | JSONB | Array of turn records |
| `turn_count` | INT | Number of conversation turns |
| `model_config` | JSONB | Arm assignments (baseline/strategy) |
| `created_at` | TIMESTAMPTZ | Draft creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

---

## 4. Transaction and Rollback Issues

### 4.1 Finding: No Transaction Support

**Critical Issue:** The draft_conversations operations **do not use database transactions**.

**Evidence:**
- All operations are individual HTTP requests to Supabase REST API
- No `BEGIN`, `COMMIT`, or `ROLLBACK` statements
- Each operation is atomic but not transactional

**Impact:**
- **No atomic multi-step operations** - If a vote is created from a draft, the draft deletion is not atomic with vote insertion
- **Partial failure scenarios** - Vote can succeed but draft deletion can fail
- **No rollback mechanism** - Failed operations cannot be undone

### 4.2 Example: vote_draft() Non-Atomic Operations

**Location:** [arena/routes/drafts.py#L126-L385](arena/routes/drafts.py#L126-L385)

```python
@router.post(f"{API_PREFIX}/draft/{{session_id}}/vote")
async def vote_draft(session_id: str, body: Dict[str, Any] = Body(...), background_tasks: BackgroundTasks = BackgroundTasks()) -> JSONResponse:
    # Step 1: Fetch draft
    resp = await client.get(url, headers=headers, params=params, timeout=10.0)
    
    # Step 2: Extract data and map vote
    
    # Step 3: Build vote row
    
    # Step 4: Insert vote (separate operation)
    vote_id = await _insert_vote_supabase(row)
    
    # Step 5: Schedule background evaluation
    
    # Step 6: Delete draft (separate operation - NOT ATOMIC)
    async with httpx.AsyncClient() as client:
        await client.delete(url, headers=headers, params=params, timeout=10.0)
    
    # Step 7: Restore session to memory store
```

**Failure Scenario:**
1. Vote insertion succeeds → `vote_id` returned
2. Draft deletion fails (network error, timeout, etc.)
3. **Result:** Vote exists in database, draft still exists
4. **User impact:** User can vote again on the same draft (duplicate vote risk)

### 4.3 Comparison with votes.py

**Votes table operations** also don't use transactions, but they have:
- Idempotency via `session_id` unique constraint
- Retry logic with `_http_post_json_with_retries()`
- Unique violation handling

**Drafts table operations** lack:
- Idempotency (only `session_id` unique constraint)
- Retry logic (only one attempt with fallback PATCH)
- No compensation queue for failed writes

---

## 5. Error Handling for Database Write Failures

### 5.1 Current Error Handling Pattern

**Location:** [arena/routes/drafts.py#L27-L88](arena/routes/drafts.py#L27-L88)

```python
try:
    # ... build row ...
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=row, timeout=10.0)
        if resp.status_code >= 400:
            if _looks_like_unique_violation(resp):
                # Fallback to PATCH
                patch_url = f"{SUPABASE_URL}/rest/v1/draft_conversations?session_id=eq.{session_id}"
                resp = await client.patch(patch_url, headers=patch_headers, json=row, timeout=10.0)
                if resp.status_code < 400:
                    return JSONResponse({"ok": True, "session_id": session_id})
            return JSONResponse({"ok": False, "error": f"Database error: {resp.text}"}, status_code=500)
    
    return JSONResponse({"ok": True, "session_id": session_id})
except Exception as e:
    return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
```

### 5.2 Error Handling Limitations

**Issues:**

1. **Generic error messages:**
   - `"Database error: {resp.text}"` - Exposes internal errors to client
   - `str(e)` - Stack traces may leak sensitive info

2. **No retry logic:**
   - Only one attempt for POST
   - Fallback PATCH is also single attempt
   - No exponential backoff

3. **No circuit breaker:**
   - Unlike votes table, drafts don't use `supabase_breaker`
   - No protection against cascading failures

4. **No compensation queue:**
   - Failed writes are lost permanently
   - No retry mechanism for transient failures

5. **No metrics tracking:**
   - No logging of failure rates
   - No monitoring of draft save success/failure

### 5.3 Comparison with votes.py Error Handling

**Votes table** has robust error handling:

```python
# From arena/db/votes.py
async def _insert_vote_supabase(row: Dict[str, Any]) -> Optional[str]:
    # 1. Check for existing vote (idempotency)
    existing = await _fetch_vote_id_by_session_id_supabase(session_id)
    if existing:
        return existing
    
    # 2. Insert with retry logic
    resp = await _http_post_json_with_retries(client, url, headers, row, timeout=REQUEST_TIMEOUT)
    
    # 3. Handle unique violation
    if _looks_like_unique_violation(resp):
        existing = await _fetch_vote_id_by_session_id_supabase(session_id)
        if existing:
            return existing
    
    # 4. Raise error on failure
    raise RuntimeError(f"supabase insert failed {resp.status_code}: {resp.text}")
```

**Drafts table** has minimal error handling:
- No retry logic
- No idempotency check before insert
- Generic error responses

### 5.4 Available Infrastructure Not Used

The codebase has robust infrastructure that is **not used** for drafts:

1. **Circuit Breaker:** [arena/db/circuit_breaker.py](arena/db/circuit_breaker.py)
   - `supabase_breaker` singleton exists
   - Not used in drafts.py

2. **Compensation Queue:** [arena/db/compensation.py](arena/db/compensation.py)
   - `compensation_queue` singleton exists
   - Used for post_vote_turns
   - Not used for drafts

3. **Retry Logic:** [arena/llm.py](arena/llm.py)
   - `_http_post_json_with_retries()` function exists
   - Used in votes.py
   - Not used in drafts.py

4. **Metrics Tracking:** [arena/db/metrics.py](arena/db/metrics.py)
   - `DBMetrics` class exists
   - Tracks insert_retryable, insert_non_retryable
   - Not used for drafts

---

## 6. Race Conditions and Timing Issues

### 6.1 Race Condition #1: Concurrent Draft Upserts

**Location:** [arena/routes/drafts.py#L61-L88](arena/routes/drafts.py#L61-L88)

**Scenario:**
1. User sends two rapid requests to save the same draft (e.g., network retry)
2. Both requests execute concurrently
3. Request A: POST with `on_conflict=session_id`
4. Request B: POST with `on_conflict=session_id`
5. Both hit unique constraint violation

**Current Handling:**
```python
if _looks_like_unique_violation(resp):
    # Concurrent insert won, fall back to PATCH
    patch_url = f"{SUPABASE_URL}/rest/v1/draft_conversations?session_id=eq.{session_id}"
    resp = await client.patch(patch_url, headers=patch_headers, json=row, timeout=10.0)
```

**Issues:**
- **Race condition in fallback:** Both requests may fall back to PATCH
- **Last write wins:** Whichever PATCH completes last overwrites the other
- **No version checking:** No optimistic locking to detect concurrent updates
- **Data loss risk:** Earlier update may be silently overwritten

**Mitigation Needed:**
- Add version field with optimistic locking
- Use `updated_at` timestamp for conflict detection
- Implement proper idempotency with version check

### 6.2 Race Condition #2: Vote on Draft + Concurrent Update

**Location:** [arena/routes/drafts.py#L126-L385](arena/routes/drafts.py#L126-L385)

**Scenario:**
1. User is viewing a draft page
2. User submits vote → `vote_draft()` executes
3. Simultaneously, auto-save triggers → `save_draft()` executes
4. Both operations read the same draft
5. Vote deletes draft
6. Auto-save tries to update deleted draft

**Current Handling:**
```python
# vote_draft() - Step 6: Delete draft
async with httpx.AsyncClient() as client:
    await client.delete(url, headers=headers, params=params, timeout=10.0)

# save_draft() - Step 3: Upsert
resp = await client.post(url, headers=headers, json=row, timeout=10.0)
```

**Issues:**
- **No atomic read-modify-write:** Vote reads draft, then deletes it
- **No lock:** Auto-save can read draft before vote deletes it
- **Orphaned vote:** If auto-save fails after vote deletion, draft is lost
- **Duplicate vote risk:** If auto-save recreates draft, user can vote again

**Mitigation Needed:**
- Use database-level locking (SELECT FOR UPDATE)
- Implement draft status field (draft/voted/deleted)
- Add unique constraint on vote_id to prevent duplicate votes

### 6.3 Race Condition #3: Draft Deletion + Session Restore

**Location:** [arena/routes/drafts.py#L338-L385](arena/routes/drafts.py#L338-L385)

**Scenario:**
1. User votes on draft → `vote_draft()` executes
2. Vote inserted successfully
3. Draft deleted successfully
4. Session restore to memory store fails
5. **Result:** Vote exists, but session not in memory

**Current Handling:**
```python
# Step 6: Delete draft
async with httpx.AsyncClient() as client:
    await client.delete(url, headers=headers, params=params, timeout=10.0)

# Step 7: Restore session to memory store
_SESSION_STORE = get_state().session_store
if winner_side:
    restored_session = { ... }
    session_restored = await _SESSION_STORE.put_or_update(session_id, restored_session)
    if not session_restored:
        log_error("draft_session_restore_failed", ...)
```

**Issues:**
- **No rollback:** If session restore fails, draft is already deleted
- **No compensation:** Failed session restore is not retried
- **User impact:** User cannot continue post-vote chat
- **Data inconsistency:** Vote exists but no corresponding session

**Mitigation Needed:**
- Delete draft AFTER session restore succeeds
- Implement compensation queue for failed session restores
- Add fallback to recreate draft from vote record

### 6.4 Timing Issue: Frontend Auto-Save Race

**Location:** [web/app/battle/page.tsx#L224-L246](web/app/battle/page.tsx#L224-L246)

**Scenario:**
1. User completes turn N
2. Frontend triggers auto-save for turn N
3. User immediately completes turn N+1
4. Frontend triggers auto-save for turn N+1
5. Both saves may arrive out of order

**Current Handling:**
```typescript
// Frontend sends draft save after each turn
await fetch("/api/proxy/api/arena/draft", {
  method: "POST",
  body: JSON.stringify({
    turn_count: currentTurn,
    conversation_history: conversationHistory,
  }),
});
```

**Issues:**
- **No ordering guarantee:** Saves may arrive out of order
- **Overwrite risk:** Later save with lower turn_count may overwrite earlier save
- **Data loss:** If turn N+1 save arrives before turn N save, turn N data is lost

**Mitigation Needed:**
- Add version/timestamp field for ordering
- Reject saves with lower turn_count than existing
- Implement optimistic locking with version check

### 6.5 Timing Issue: Session Expiration + Draft Save

**Location:** [arena/session/base.py](arena/session/base.py)

**Scenario:**
1. User session expires from memory store (TTL: 7200s)
2. Frontend still has session_id
3. User completes another turn
4. Frontend tries to save draft
5. Draft save succeeds (no session validation)
6. **Result:** Draft exists but no corresponding in-memory session

**Current Handling:**
```python
# save_draft() does NOT validate session exists
async def save_draft(body: Dict[str, Any] = Body(...)) -> JSONResponse:
    session_id = (body.get("session_id") or "").strip()
    # No check if session exists in memory store
    # Direct upsert to database
```

**Issues:**
- **No session validation:** Draft can be saved for expired sessions
- **Orphaned drafts:** Drafts exist without corresponding sessions
- **Cleanup needed:** No mechanism to clean up orphaned drafts

**Mitigation Needed:**
- Validate session exists before saving draft
- Add draft expiration/cleanup job
- Implement draft status field (active/expired)

---

## 7. Summary of Issues

### 7.1 Critical Issues

| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| No transaction support | HIGH | Partial failures, data inconsistency | All draft operations |
| Race condition in concurrent upserts | HIGH | Data loss, last-write-wins | [drafts.py#L61-L88](arena/routes/drafts.py#L61-L88) |
| No retry logic | HIGH | Transient failures cause permanent data loss | All draft operations |
| No circuit breaker | MEDIUM | Cascading failures during outages | All draft operations |
| No compensation queue | MEDIUM | Failed writes lost permanently | All draft operations |

### 7.2 Medium Issues

| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| Generic error messages | MEDIUM | Poor UX, potential security leak | All draft operations |
| No metrics tracking | MEDIUM | No visibility into failure rates | All draft operations |
| No session validation | MEDIUM | Orphaned drafts | [drafts.py#L27](arena/routes/drafts.py#L27) |
| Frontend auto-save race | MEDIUM | Data loss, out-of-order saves | [battle/page.tsx#L224](web/app/battle/page.tsx#L224) |

### 7.3 Low Issues

| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| No dedicated helper functions | LOW | Code duplication, maintenance burden | All draft operations |
| No version field | LOW | No optimistic locking | Schema |
| No draft cleanup job | LOW | Accumulation of orphaned drafts | N/A |

---

## 8. Recommendations

### 8.1 Immediate Actions (High Priority)

1. **Add transaction support for vote_draft():**
   - Use Supabase RPC function for atomic vote+delete
   - Or implement application-level transaction with compensation

2. **Implement retry logic:**
   - Use `_http_post_json_with_retries()` from arena/llm.py
   - Add exponential backoff with jitter
   - Configure MAX_RETRIES and BACKOFF_BASE

3. **Add circuit breaker:**
   - Wrap all draft operations with `supabase_breaker`
   - Configure failure_threshold and recovery_timeout
   - Add health check endpoint for breaker status

4. **Implement compensation queue:**
   - Use existing `compensation_queue` from arena/db/compensation.py
   - Enqueue failed draft saves for retry
   - Add background job to process queue

### 8.2 Short-term Actions (Medium Priority)

5. **Add version field for optimistic locking:**
   ```sql
   ALTER TABLE draft_conversations ADD COLUMN version INT DEFAULT 0;
   ```
   - Check version before update
   - Reject updates with stale version

6. **Improve error handling:**
   - Return specific error codes (not generic messages)
   - Log detailed errors server-side
   - Add metrics tracking for failures

7. **Add session validation:**
   - Check session exists in memory store before saving draft
   - Return 404 if session not found
   - Add draft cleanup job for orphaned drafts

8. **Fix frontend auto-save race:**
   - Add version/timestamp to draft saves
   - Reject saves with lower turn_count
   - Implement client-side deduplication

### 8.3 Long-term Actions (Low Priority)

9. **Create dedicated helper functions:**
   - Move draft operations to arena/db/drafts.py
   - Follow pattern of arena/db/votes.py
   - Add unit tests for helper functions

10. **Add draft status field:**
    ```sql
    ALTER TABLE draft_conversations ADD COLUMN status TEXT DEFAULT 'active';
    ```
    - Track draft lifecycle (active/voted/deleted/expired)
    - Prevent operations on non-active drafts

11. **Implement draft cleanup job:**
    - Delete expired drafts (older than TTL)
    - Delete orphaned drafts (no corresponding session)
    - Run periodically via APScheduler

---

## 9. Appendix: Code References

### 9.1 Key Files

| File | Purpose |
|------|---------|
| [arena/routes/drafts.py](arena/routes/drafts.py) | Draft CRUD routes |
| [migrations/add_draft_conversations.sql](migrations/add_draft_conversations.sql) | Table schema |
| [arena/db/votes.py](arena/db/votes.py) | Vote operations (reference) |
| [arena/db/circuit_breaker.py](arena/db/circuit_breaker.py) | Circuit breaker (not used) |
| [arena/db/compensation.py](arena/db/compensation.py) | Compensation queue (not used) |
| [arena/db/helpers.py](arena/db/helpers.py) | Helper utilities |
| [arena/session/base.py](arena/session/base.py) | Session store |
| [web/app/battle/page.tsx](web/app/battle/page.tsx) | Frontend draft save |

### 9.2 Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `save_draft()` | [drafts.py#L27](arena/routes/drafts.py#L27) | Save/update draft |
| `get_drafts()` | [drafts.py#L90](arena/routes/drafts.py#L90) | List user drafts |
| `get_single_draft()` | [drafts.py#L121](arena/routes/drafts.py#L121) | Get draft by session_id |
| `vote_draft()` | [drafts.py#L126](arena/routes/drafts.py#L126) | Vote on draft |
| `delete_draft()` | [drafts.py#L385](arena/routes/drafts.py#L385) | Delete draft |
| `_looks_like_unique_violation()` | [helpers.py#L8](arena/db/helpers.py#L8) | Detect unique violation |

### 9.3 Configuration

| Config | Location | Default |
|--------|----------|---------|
| `REQUEST_TIMEOUT` | [config.py#L68](arena/config.py#L68) | 60s |
| `MAX_RETRIES` | [config.py#L69](arena/config.py#L69) | 3 |
| `BACKOFF_BASE` | [config.py#L70](arena/config.py#L70) | 1.0 |
| `SUPABASE_URL` | [config.py#L56](arena/config.py#L56) | From env |
| `SUPABASE_SERVICE_KEY` | [config.py#L57](arena/config.py#L57) | From env |

---

**End of Analysis**
