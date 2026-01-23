# migrations/ - Database Schema

**Parent:** `../AGENTS.md`
**Type:** SQL Migration Scripts (PostgreSQL/Supabase)
**Version:** Phase 9.1
**Last Updated:** 2026-01-23

---

## Purpose

The `migrations/` directory contains SQL migration scripts for the Supabase PostgreSQL database. These scripts implement the echat-arena schema in phases, enabling multi-turn conversations, voting idempotency, post-vote chat, and session persistence.

**Key Responsibility:** Provide version-controlled, reproducible database schema changes for safe and consistent deployments.

---

## Directory Structure

```
migrations/
├── README.md                           # Comprehensive migration guide
├── add_conversation_history.sql        # Phase 3.3: Multi-turn support
├── add_jsonb_indexes.sql              # Performance indexes for JSONB
├── add_post_vote_chat.sql             # Phase 8.2: Post-vote chat
├── add_vote_idempotency.sql           # Phase 8.3: Duplicate vote prevention
├── add_arena_sessions_table.sql       # Phase 9.1: Session persistence
├── verify_schema.sql                   # Verification script (all phases)
├── rollback_conversation_history.sql   # Emergency rollback script
└── AGENTS.md                           # This file
```

---

## Migration Phases Overview

| Phase | File | Purpose | Status |
|-------|------|---------|--------|
| 3.3 | `add_conversation_history.sql` | Add multi-turn conversation support | Active |
| 8.2 | `add_post_vote_chat.sql` | Post-vote chat continuation | Active |
| 8.3 | `add_vote_idempotency.sql` | Prevent duplicate votes | Active |
| 9.1 | `add_arena_sessions_table.sql` | Persistent session storage | Active |

---

## Core Migration Files

### Phase 3.3: Multi-Turn Conversation Support

**File:** `add_conversation_history.sql`

**What it does:**
- Adds `conversation_history` column (JSONB) to `votes` table
- Adds `turn_count` column (INTEGER) to `votes` table
- Creates index `idx_votes_turn_count` for query optimization

**Data Structure (conversation_history):**
```json
[
  {
    "turn": 1,
    "user": "First user message",
    "reply_a": "Model A response 1",
    "reply_b": "Model B response 1",
    "timestamp": "2026-01-23T12:00:00Z"
  },
  {
    "turn": 2,
    "user": "Follow-up message",
    "reply_a": "Model A response 2",
    "reply_b": "Model B response 2",
    "timestamp": "2026-01-23T12:01:00Z"
  }
]
```

**Usage Examples:**
```sql
-- Find all multi-turn conversations
SELECT * FROM votes WHERE turn_count > 1;

-- Analyze turn count distribution
SELECT turn_count, COUNT(*) FROM votes GROUP BY turn_count;

-- Extract user inputs from first turn
SELECT jsonb_array_elements(conversation_history)->>'user'
FROM votes WHERE turn_count >= 1;
```

**AI Instructions:**
- `turn_count` is a denormalized field for query performance
- `conversation_history` is append-only within a session
- Use `conversation_history` for complete audit trail

---

### Phase 8.2: Post-Vote Chat Support

**File:** `add_post_vote_chat.sql`

**What it does:**
- Creates new `post_vote_turns` table for chat after voting
- Stores post-vote interactions separately (doesn't contaminate experimental data)
- Adds indexes for efficient querying

**Table Structure:**
```sql
post_vote_turns (
  id UUID PRIMARY KEY,
  vote_id UUID NOT NULL,           -- Links to votes.id
  user_id UUID,                     -- User (may be NULL)
  winner_side TEXT,                 -- 'left' or 'right'
  turn_index INTEGER,               -- Turn number (1+)
  user_message TEXT,                -- User's message
  assistant_message TEXT,           -- Model's response
  created_at TIMESTAMPTZ            -- Timestamp
)
```

**Purpose:**
- Allow users to continue chatting with winning model after voting
- Keep experimental data (votes table) clean for analysis
- Preserve complete user interaction history

**Usage Example:**
```sql
-- Get all post-vote messages for a vote
SELECT * FROM post_vote_turns
WHERE vote_id = 'vote-uuid'
ORDER BY turn_index ASC;

-- Count post-vote engagement per vote
SELECT vote_id, COUNT(*) as post_vote_turns_count
FROM post_vote_turns
GROUP BY vote_id;
```

**AI Instructions:**
- Post-vote data is NOT included in experimental analysis
- Each `(vote_id, turn_index)` pair is unique
- Use `winner_side` to determine which model responded

---

### Phase 8.3: Vote Idempotency

**File:** `add_vote_idempotency.sql`

**What it does:**
- Adds UNIQUE constraint on `votes.session_id`
- Prevents duplicate votes from network retries or user error

**Constraint:** `UNIQUE (session_id)`

**Risk:** Will FAIL if existing duplicate `session_id` values exist

**Pre-Migration Check:**
```sql
-- Find duplicates before running migration
SELECT session_id, COUNT(*)
FROM votes
WHERE session_id IS NOT NULL
GROUP BY session_id
HAVING COUNT(*) > 1;
```

**If Duplicates Found:**
```sql
-- Delete all but earliest vote per session
WITH duplicates AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY session_id
    ORDER BY created_at ASC
  ) as rn FROM votes
)
DELETE FROM votes WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
```

**AI Instructions:**
- ALWAYS run the check query before applying migration
- Clean duplicates before running constraint
- This prevents `/api/arena/vote` endpoint from creating duplicates on retry

---

### Phase 9.1: Session Persistence

**File:** `add_arena_sessions_table.sql`

**What it does:**
- Creates `arena_sessions` table for persistent session storage
- Enables recovery from Heroku dyno restarts
- Supports multi-instance deployment
- Implements optimistic locking and TTL management

**Table Structure:**
```sql
arena_sessions (
  session_id TEXT PRIMARY KEY,      -- Session identifier
  session_data JSONB NOT NULL,      -- Full session state
  version BIGINT DEFAULT 1,         -- Optimistic lock version
  expires_at TIMESTAMPTZ,           -- TTL expiration
  deleted_at TIMESTAMPTZ,           -- Soft delete marker
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**session_data Structure:**
```json
{
  "session_id": "abc123",
  "prompt": "User's initial prompt",
  "left": {
    "arm": "left",
    "model_id": "model_a",
    "text": "Response text",
    "context": [
      {"role": "user", "content": "..."},
      {"role": "assistant", "content": "..."}
    ]
  },
  "right": {
    "arm": "right",
    "model_id": "model_b",
    "text": "Response text",
    "context": [
      {"role": "user", "content": "..."},
      {"role": "assistant", "content": "..."}
    ]
  },
  "conversation_history": [
    {
      "turn": 1,
      "user_msg": "...",
      "reply_a": "...",
      "reply_b": "...",
      "timestamp": "2026-01-23T..."
    }
  ],
  "turn_count": 1,
  "version": 1,
  "created_at": "2026-01-23T...",
  "winner": null,
  "vote_id": null
}
```

**Key Features:**

1. **Context Isolation:**
   - `left.context` - Only left model's history
   - `right.context` - Only right model's history
   - Each model is blind to opponent's responses

2. **Optimistic Locking:**
   ```sql
   -- Only update if version hasn't changed
   UPDATE arena_sessions
   SET session_data = '...'::jsonb, version = version + 1
   WHERE session_id = 'abc123' AND version = 5;
   ```

3. **TTL Management:**
   ```sql
   -- Sessions expire after configured duration
   SELECT * FROM arena_sessions
   WHERE expires_at < NOW();
   ```

4. **Soft Delete:**
   ```sql
   -- Mark as deleted without removing data
   UPDATE arena_sessions
   SET deleted_at = NOW()
   WHERE session_id = 'abc123';
   ```

**Usage Examples:**
```sql
-- Retrieve active session
SELECT session_data FROM arena_sessions
WHERE session_id = 'abc123'
AND deleted_at IS NULL
AND expires_at > NOW();

-- Count active sessions
SELECT COUNT(*) FROM arena_sessions
WHERE deleted_at IS NULL AND expires_at > NOW();

-- Clean expired sessions
DELETE FROM arena_sessions
WHERE expires_at < NOW() AND deleted_at IS NULL;
```

**AI Instructions:**
- Session data is fully self-contained (no foreign keys)
- `version` prevents lost updates in concurrent scenarios
- `deleted_at` allows recovery (no hard deletes)
- Always check `deleted_at IS NULL` in queries

---

## Verification & Testing

### Verification Script

**File:** `verify_schema.sql`

**Purpose:** Confirm all migrations have been applied successfully

**Command:** Run in Supabase SQL Editor after each migration

**Expected Output:**
```
✓ conversation_history column exists
✓ turn_count column exists
✓ post_vote_turns table exists
✓ arena_sessions table exists
✓ All indexes created
```

**Usage:**
```sql
-- Copy and run entire verify_schema.sql file
-- Check for any errors or missing objects
```

---

### Rollback Script

**File:** `rollback_conversation_history.sql`

**Warning:** ⚠️ DESTRUCTIVE - Permanently deletes conversation data

**Use Only When:**
- Migration was applied in error
- Data loss is acceptable
- Must rollback to earlier schema version

**What it removes:**
- `conversation_history` column
- `turn_count` column
- Associated indexes
- ALL stored conversation data

**Command:**
```sql
-- Only run if absolutely necessary
-- Backup database first!
-- Copy and run entire rollback_conversation_history.sql file
```

---

## Execution Strategy

### Recommended Migration Order

Execute migrations in this sequence:

1. **Phase 3.3:** `add_conversation_history.sql`
   - Enables multi-turn support
   - Safe to run anytime (adds columns with defaults)

2. **Performance:** `add_jsonb_indexes.sql` (optional)
   - Improves query performance on JSONB columns
   - Can be deferred if not indexed yet

3. **Phase 8.2:** `add_post_vote_chat.sql`
   - Enables post-vote chat
   - Independent table (no conflicts)

4. **Data Cleanup:** Check for duplicates
   ```sql
   SELECT session_id, COUNT(*) FROM votes
   WHERE session_id IS NOT NULL
   GROUP BY session_id
   HAVING COUNT(*) > 1;
   ```

5. **Phase 8.3:** `add_vote_idempotency.sql`
   - Adds uniqueness constraint
   - ONLY after confirming no duplicates

6. **Phase 9.1:** `add_arena_sessions_table.sql`
   - Enables session persistence
   - No risk to existing tables

7. **Verification:** `verify_schema.sql`
   - Confirm all changes applied correctly

### Step-by-Step Execution

**Via Supabase Dashboard:**

1. Open SQL Editor
2. Click "New Query"
3. Copy migration file contents
4. Click "Run"
5. Check for errors
6. Repeat for next migration

**Via CLI (if using Supabase CLI):**
```bash
supabase db push --dry-run          # Test without applying
supabase db push                     # Apply migration
supabase db verify                   # Confirm success
```

---

## Data Integrity & Backup

### Before Any Migration

```bash
# 1. Backup entire database
# Via Supabase Dashboard:
# - Project Settings → Database → Backups → Trigger backup

# 2. Note current schema state
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

### Post-Migration Verification

```sql
-- Verify table structure
\d votes;
\d arena_sessions;

-- Verify indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename IN ('votes', 'arena_sessions');

-- Check data integrity
SELECT COUNT(*) FROM votes;
SELECT COUNT(*) FROM arena_sessions;
```

### Rollback Procedure

**If migration causes issues:**

1. Stop application immediately
2. Review error in Supabase logs
3. Restore from backup (Supabase Dashboard → Backups → Restore)
4. Investigate root cause
5. Fix migration or data
6. Test in staging before retry

---

## Common Patterns & Queries

### Query Multi-Turn Conversations

```sql
-- Count conversations by turn count
SELECT
  turn_count,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM votes
GROUP BY turn_count
ORDER BY turn_count;
```

### Extract Conversation Details

```sql
-- Get all turns for specific session
SELECT
  session_id,
  (elem)->>'turn' as turn_num,
  (elem)->>'user' as user_message,
  (elem)->>'reply_a' as model_a_response,
  (elem)->>'reply_b' as model_b_response,
  (elem)->>'timestamp' as timestamp
FROM votes,
LATERAL jsonb_array_elements(conversation_history) as elem
WHERE session_id = 'your-session-id'
ORDER BY (elem)->>'turn'::int;
```

### Post-Vote Chat Stats

```sql
-- How many sessions had post-vote chat?
SELECT
  COUNT(DISTINCT vote_id) as sessions_with_post_vote,
  SUM(turn_index) as total_post_vote_turns
FROM post_vote_turns;
```

### Session Persistence Stats

```sql
-- Active sessions by age
SELECT
  CEIL(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600) as hours_old,
  COUNT(*) as count
FROM arena_sessions
WHERE deleted_at IS NULL AND expires_at > NOW()
GROUP BY hours_old
ORDER BY hours_old;
```

---

## Troubleshooting

### Migration Fails: "Column already exists"

**Cause:** Migration was previously applied

**Solution:**
```sql
-- Check if column exists
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'votes'
AND column_name = 'conversation_history';

-- If it exists, migration is complete - skip it
```

### Migration Fails: "Unique constraint violation"

**Cause:** `add_vote_idempotency.sql` failed due to duplicates

**Solution:**
```sql
-- Find and delete duplicates (see earlier instructions)
-- Then re-run migration
```

### Migration Fails: "Insufficient permissions"

**Cause:** User role lacks privileges

**Solution:**
1. Use Supabase service role (highest privileges)
2. Check user role: `SELECT current_role;`
3. Grant permissions if needed: `GRANT ALL ON PUBLIC.* TO role_name;`

### Performance Degradation After Migration

**Cause:** Missing or inefficient indexes

**Solution:**
```sql
-- Check index usage
SELECT indexname FROM pg_indexes WHERE tablename = 'votes';

-- Run VACUUM ANALYZE to update statistics
VACUUM ANALYZE votes;

-- Check query plan
EXPLAIN ANALYZE SELECT * FROM votes WHERE turn_count > 1;
```

---

## Performance Considerations

### JSONB vs Denormalization

**Decision:** Store `conversation_history` as JSONB, `turn_count` as denormalized INTEGER

**Rationale:**
- JSONB allows flexible schema evolution
- `turn_count` index enables fast filtering (common queries)
- Avoids expensive JSONB array length computation

**Trade-off:**
- Slight increase in storage (duplication)
- Guaranteed O(1) query for turn count filtering

### Index Strategy

**Current Indexes:**
- `idx_votes_turn_count` - Filter by conversation length
- `idx_post_vote_turns_vote_id_turn` - Retrieve post-vote chat for specific vote
- `idx_arena_sessions_expires_at` - Cleanup expired sessions

**Future Indexes (if needed):**
```sql
-- For JSONB queries on emotion classification
CREATE INDEX idx_votes_emotion
ON votes ((session_data->>'emotion'));

-- For filtering by model
CREATE INDEX idx_votes_model
ON votes ((session_data->>'model_id'));
```

---

## Security & Access Control

### Role-Based Access

**Supabase Roles:**
- `postgres` (admin) - Full access
- `authenticated` (user) - Limited to own data (RLS)
- `anon` (public) - No direct database access

**Current Setup:**
- Backend uses service role (full access for audit/admin operations)
- Frontend uses anon key (no direct SQL, uses API only)

### Row Level Security (RLS)

**Status:** Recommended but not currently enforced

**Future Enhancement:**
```sql
-- Enable RLS on votes table
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Allow users to see only their own votes
CREATE POLICY users_see_own_votes ON votes
  FOR SELECT USING (auth.uid() = user_id);
```

---

## Maintenance & Cleanup

### Automated Cleanup (Recommended)

**Set up PostgreSQL cron job:**
```sql
-- Clean expired sessions (runs daily at 3 AM)
SELECT cron.schedule('cleanup-expired-sessions', '0 3 * * *', $$
  DELETE FROM arena_sessions
  WHERE expires_at < NOW() AND deleted_at IS NULL;
$$);

-- Archive old votes (runs weekly)
SELECT cron.schedule('archive-old-votes', '0 2 * * 0', $$
  DELETE FROM votes
  WHERE created_at < NOW() - INTERVAL '90 days';
$$);
```

### Manual Maintenance

```bash
# Analyze query performance
VACUUM ANALYZE votes;
VACUUM ANALYZE arena_sessions;

# Check database size
SELECT
  pg_size_pretty(pg_total_relation_size('votes')) as votes_size,
  pg_size_pretty(pg_total_relation_size('arena_sessions')) as sessions_size;

# List largest tables
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename) DESC;
```

---

## Related Documentation

**Root Project:**
- `/home/ranthaha1/echat-arena/AGENTS.md` - Root project guide
- `/home/ranthaha1/echat-arena/README.md` - Project overview

**Backend Integration:**
- `/home/ranthaha1/echat-arena/app.py` - Backend uses these tables
- `/home/ranthaha1/echat-arena/plans/DEPLOYMENT_CHECKLIST.md` - Deployment steps

**Planning & Design:**
- `/home/ranthaha1/echat-arena/plans/sessionstore_supabase_complete_design.md` - Design document
- `/home/ranthaha1/echat-arena/plans/MULTI_TURN_TESTING.md` - Testing guide

**Deployment:**
- `/home/ranthaha1/echat-arena/DEPLOYMENT_GUIDE.md` - Full deployment walkthrough
- `/home/ranthaha1/echat-arena/migrations/README.md` - Detailed migration guide

---

## Quick Reference: Essential SQL

```sql
-- Check schema status
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Verify migration status
\i migrations/verify_schema.sql

-- Count records
SELECT 'votes' as table_name, COUNT(*) as count FROM votes
UNION ALL
SELECT 'post_vote_turns', COUNT(*) FROM post_vote_turns
UNION ALL
SELECT 'arena_sessions', COUNT(*) FROM arena_sessions;

-- Find active sessions
SELECT COUNT(*) as active_sessions
FROM arena_sessions
WHERE deleted_at IS NULL AND expires_at > NOW();

-- Export votes with conversation history
\COPY (SELECT id, session_id, turn_count, conversation_history FROM votes)
TO '/tmp/votes_backup.csv' WITH CSV HEADER;
```

---

## Version & Updates

**Version:** Phase 9.1
**Last Updated:** 2026-01-23
**Parent Guide:** `../AGENTS.md`

**Recent Changes:**
- Phase 9.1: Added session persistence (`arena_sessions` table)
- Phase 8.3: Vote idempotency constraints
- Phase 8.2: Post-vote chat support
- Phase 3.3: Multi-turn conversation history

---

**Maintain Clarity:** Update this guide when adding new migrations. Document all changes in README.md.
