-- Verification script for conversation history migration
-- Run this after executing add_conversation_history.sql to verify success

DO $$
DECLARE
  conv_history_exists BOOLEAN;
  turn_count_exists BOOLEAN;
  index_exists BOOLEAN;
BEGIN
  -- Check if conversation_history column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'votes' AND column_name = 'conversation_history'
  ) INTO conv_history_exists;

  IF NOT conv_history_exists THEN
    RAISE EXCEPTION 'Migration failed: conversation_history column not found';
  END IF;

  -- Check if turn_count column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'votes' AND column_name = 'turn_count'
  ) INTO turn_count_exists;

  IF NOT turn_count_exists THEN
    RAISE EXCEPTION 'Migration failed: turn_count column not found';
  END IF;

  -- Check if index exists
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'votes' AND indexname = 'idx_votes_turn_count'
  ) INTO index_exists;

  IF NOT index_exists THEN
    RAISE WARNING 'Index idx_votes_turn_count not found (optional)';
  END IF;

  RAISE NOTICE 'Migration verification passed!';
  RAISE NOTICE 'conversation_history column: EXISTS';
  RAISE NOTICE 'turn_count column: EXISTS';
  RAISE NOTICE 'idx_votes_turn_count index: %', CASE WHEN index_exists THEN 'EXISTS' ELSE 'MISSING' END;
END $$;

-- Display column details
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'votes' 
AND column_name IN ('conversation_history', 'turn_count')
ORDER BY column_name;

-- Display index information
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'votes' 
AND indexname = 'idx_votes_turn_count';
