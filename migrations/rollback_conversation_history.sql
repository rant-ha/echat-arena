-- Rollback script for conversation history migration
-- Run this if you need to remove the conversation history columns
-- WARNING: This will permanently delete the conversation_history and turn_count data

-- Drop index first
DROP INDEX IF EXISTS idx_votes_turn_count;

-- Drop columns
ALTER TABLE votes DROP COLUMN IF EXISTS conversation_history;
ALTER TABLE votes DROP COLUMN IF EXISTS turn_count;

-- Verify rollback
DO $$
DECLARE
  conv_history_exists BOOLEAN;
  turn_count_exists BOOLEAN;
BEGIN
  -- Check if conversation_history column was removed
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'votes' AND column_name = 'conversation_history'
  ) INTO conv_history_exists;

  -- Check if turn_count column was removed
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'votes' AND column_name = 'turn_count'
  ) INTO turn_count_exists;

  IF conv_history_exists OR turn_count_exists THEN
    RAISE EXCEPTION 'Rollback failed: columns still exist';
  ELSE
    RAISE NOTICE 'Rollback successful! conversation_history and turn_count columns removed.';
  END IF;
END $$;
