-- Draft conversations table for saving unvoted chat sessions
-- Allows users to resume conversations that weren't voted on

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

-- Index for efficient user lookup
CREATE INDEX IF NOT EXISTS idx_draft_user_id ON draft_conversations(user_id);

-- Index for session lookup (used for upsert and delete)
CREATE INDEX IF NOT EXISTS idx_draft_session_id ON draft_conversations(session_id);

-- Enable RLS
ALTER TABLE draft_conversations ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own drafts
CREATE POLICY "Users can view own drafts" ON draft_conversations
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: users can insert their own drafts
CREATE POLICY "Users can insert own drafts" ON draft_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: users can update their own drafts
CREATE POLICY "Users can update own drafts" ON draft_conversations
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: users can delete their own drafts
CREATE POLICY "Users can delete own drafts" ON draft_conversations
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can do everything (for backend API)
CREATE POLICY "Service role full access" ON draft_conversations
  FOR ALL USING (auth.role() = 'service_role');
