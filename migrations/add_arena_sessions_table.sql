-- Migration script for arena_sessions table
-- This script creates the main table for persistent session storage
-- with support for soft deletion and optimistic locking

-- Create the arena_sessions table
CREATE TABLE IF NOT EXISTS arena_sessions (
  session_id  TEXT PRIMARY KEY,
  session_data JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Optimistic locking version number
  version     BIGINT NOT NULL DEFAULT 0,

  -- TTL for session expiration
  expires_at  TIMESTAMPTZ NOT NULL,

  -- Soft deletion support
  deleted_at  TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for TTL-based cleanup
CREATE INDEX IF NOT EXISTS idx_arena_sessions_expires_at
  ON arena_sessions (expires_at);

-- Create index for soft deletion queries
CREATE INDEX IF NOT EXISTS idx_arena_sessions_deleted_at
  ON arena_sessions (deleted_at);

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_updated_at
BEFORE UPDATE ON arena_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Create a function for cleaning up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM arena_sessions 
  WHERE expires_at < NOW() 
  AND deleted_at IS NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a function for cleaning up old soft-deleted sessions
CREATE OR REPLACE FUNCTION cleanup_old_deleted_sessions(days_threshold INTEGER)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM arena_sessions 
  WHERE deleted_at < NOW() - (days_threshold || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;