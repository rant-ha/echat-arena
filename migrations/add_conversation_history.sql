-- Migration: Add conversation history support to votes table
-- Date: 2026-01-17
-- Phase: 3.3
-- Description: Add support for multi-turn conversations in the arena voting system

-- Add conversation_history column (JSONB array)
-- Stores the complete conversation history including all turns before voting
ALTER TABLE votes 
ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '[]'::jsonb;

-- Add turn_count column (integer, minimum 1)
-- Tracks the number of conversation turns (1 = single-turn, >1 = multi-turn)
ALTER TABLE votes 
ADD COLUMN IF NOT EXISTS turn_count INTEGER DEFAULT 1;

-- Add index for querying by turn count (optional, for analytics)
-- Useful for analyzing voting patterns across different conversation lengths
CREATE INDEX IF NOT EXISTS idx_votes_turn_count ON votes(turn_count);

-- Add comments for documentation
COMMENT ON COLUMN votes.conversation_history IS 'Complete conversation history in multi-turn dialogues. Format: [{"turn": 1, "user": "...", "reply_a": "...", "reply_b": "...", "timestamp": "..."}]';
COMMENT ON COLUMN votes.turn_count IS 'Total number of conversation turns before voting. Minimum value is 1 (single-turn dialogue).';

-- Verification query (optional - run after migration to verify)
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'votes' 
-- AND column_name IN ('conversation_history', 'turn_count');
