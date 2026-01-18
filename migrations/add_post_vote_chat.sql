-- Migration: Add post-vote chat continuation support
-- Date: 2026-01-18
-- Phase: 8.2A
-- Description: Add support for post-vote chat continuation with separate table (not polluting votes table)

-- Create post_vote_turns table to store post-vote conversation turns
-- This table is separate from votes table to avoid polluting experimental data
CREATE TABLE IF NOT EXISTS post_vote_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vote_id UUID NOT NULL,
    user_id UUID NULL,
    winner_side TEXT NOT NULL CHECK (winner_side IN ('left', 'right')),
    turn_index INTEGER NOT NULL CHECK (turn_index > 0),
    user_message TEXT NOT NULL,
    assistant_message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure unique turn index per vote
    CONSTRAINT unique_vote_turn UNIQUE (vote_id, turn_index)
);

-- Index for efficient querying by vote_id and turn order
CREATE INDEX IF NOT EXISTS idx_post_vote_turns_vote_id_turn 
ON post_vote_turns(vote_id, turn_index);

-- Index for efficient querying by vote_id and creation time
CREATE INDEX IF NOT EXISTS idx_post_vote_turns_vote_id_created 
ON post_vote_turns(vote_id, created_at);

-- Index for user-specific queries (if auth is enabled)
CREATE INDEX IF NOT EXISTS idx_post_vote_turns_user_id 
ON post_vote_turns(user_id) WHERE user_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE post_vote_turns IS 'Stores post-vote chat continuation turns. Separate from votes table to avoid polluting experimental data.';
COMMENT ON COLUMN post_vote_turns.vote_id IS 'Foreign key reference to votes.id (not enforced to allow flexible deployment)';
COMMENT ON COLUMN post_vote_turns.winner_side IS 'Which side won the vote: left or right';
COMMENT ON COLUMN post_vote_turns.turn_index IS 'Sequential turn number starting from 1 for each vote_id';
COMMENT ON COLUMN post_vote_turns.user_message IS 'User input for this post-vote turn';
COMMENT ON COLUMN post_vote_turns.assistant_message IS 'Assistant response for this post-vote turn';

-- Row Level Security (RLS) policies
-- Enable RLS on the table
ALTER TABLE post_vote_turns ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (for backend writes)
CREATE POLICY "Service role has full access to post_vote_turns"
ON post_vote_turns
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Users can read their own post-vote turns (if auth is enabled)
-- This policy will work when user_id is populated and auth.uid() is available
CREATE POLICY "Users can read their own post_vote_turns"
ON post_vote_turns
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Allow anonymous read access for now (can be tightened later)
-- This allows frontend to read post-vote turns even without strict auth
CREATE POLICY "Anonymous users can read post_vote_turns"
ON post_vote_turns
FOR SELECT
TO anon
USING (true);

-- Verification query (run after migration to verify)
-- SELECT 
--     table_name, 
--     column_name, 
--     data_type, 
--     is_nullable,
--     column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'post_vote_turns'
-- ORDER BY ordinal_position;
