-- M-03 Fix: Add JSONB and performance indexes for votes table
-- Created: 2026-01-18
-- Purpose: Optimize query performance for conversation_history and common queries

-- 1. GIN index for JSONB conversation_history queries
-- This enables efficient queries on JSONB fields
CREATE INDEX IF NOT EXISTS idx_votes_conversation_history_gin 
ON votes USING gin (conversation_history);

COMMENT ON INDEX idx_votes_conversation_history_gin IS 
'GIN index for efficient JSONB conversation_history queries (M-03 fix)';

-- 2. B-tree index for turn_count (if not already exists)
-- Useful for filtering and sorting by turn count
CREATE INDEX IF NOT EXISTS idx_votes_turn_count 
ON votes(turn_count);

COMMENT ON INDEX idx_votes_turn_count IS 
'B-tree index for turn_count queries (M-03 fix)';

-- 3. Composite index for user_id + turn_count
-- Optimizes queries that filter by user and turn count together
CREATE INDEX IF NOT EXISTS idx_votes_user_turn 
ON votes(user_id, turn_count);

COMMENT ON INDEX idx_votes_user_turn IS 
'Composite index for user_id + turn_count queries (M-03 fix)';

-- 4. Index for session_id (should already exist, but ensure it's there)
CREATE INDEX IF NOT EXISTS idx_votes_session_id 
ON votes(session_id);

COMMENT ON INDEX idx_votes_session_id IS 
'B-tree index for session_id lookups (M-03 fix)';

-- 5. Index for created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_votes_created_at 
ON votes(created_at DESC);

COMMENT ON INDEX idx_votes_created_at IS 
'B-tree index for time-based queries and sorting (M-03 fix)';

-- Verify indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'votes'
ORDER BY indexname;
