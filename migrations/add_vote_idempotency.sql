-- Migration: Add vote write idempotency constraints
-- Date: 2026-01-18
-- Purpose:
--   Ensure /api/arena/vote can be retried safely without creating duplicate rows.
--   We use session_id as the idempotency key.
--
-- Notes:
--   - This migration assumes votes.session_id is present and effectively identifies a single vote session.
--   - If your existing data already contains duplicate session_id values, this will fail.
--     In that case, deduplicate first (keep the earliest row per session_id), then re-run.

DO $$
BEGIN
  -- Prefer UNIQUE(session_id)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'votes'
      AND c.conname = 'votes_session_id_unique'
  ) THEN
    ALTER TABLE votes
      ADD CONSTRAINT votes_session_id_unique UNIQUE (session_id);
  END IF;
END $$;

-- Fallback option (NOT enabled by default):
-- If session_id is not globally unique in your product requirements (not recommended),
-- you can instead enforce uniqueness on (user_id, session_id).
--
-- DO $$
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1
--     FROM pg_constraint c
--     JOIN pg_class t ON t.oid = c.conrelid
--     WHERE t.relname = 'votes'
--       AND c.conname = 'votes_user_session_unique'
--   ) THEN
--     ALTER TABLE votes
--       ADD CONSTRAINT votes_user_session_unique UNIQUE (user_id, session_id);
--   END IF;
-- END $$;
