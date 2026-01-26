-- Migration: Add winner_type column for statistics-friendly querying
-- Date: 2026-01-26
-- Description: Add semantic winner type field to simplify statistical analysis

-- 1. Add winner_type column
ALTER TABLE votes
ADD COLUMN IF NOT EXISTS winner_type VARCHAR(20);

-- 2. Backfill existing data based on user_vote
UPDATE votes SET winner_type = CASE
  WHEN user_vote = 'model_a' THEN 'baseline'
  WHEN user_vote = 'model_b' THEN 'strategy'
  WHEN user_vote = 'tie' THEN 'tie'
  WHEN user_vote = 'both_bad' THEN 'both_bad'
  ELSE NULL
END
WHERE winner_type IS NULL;

-- 3. Add index for efficient grouping/filtering
CREATE INDEX IF NOT EXISTS idx_votes_winner_type ON votes(winner_type);

-- 4. Add documentation comment
COMMENT ON COLUMN votes.winner_type IS 'Semantic winner type: baseline (control), strategy (experiment), tie, or both_bad. Maps from user_vote: model_a->baseline, model_b->strategy';

-- Verification query (run after migration)
-- SELECT winner_type, COUNT(*) FROM votes GROUP BY winner_type;
