-- Migration: Add model_configs table for dynamic model management
-- Phase: Admin UI - Model Configuration
-- Run after existing migrations

-- Create model_configs table
CREATE TABLE IF NOT EXISTS model_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Model identification
    model_key TEXT NOT NULL UNIQUE,
    model_name TEXT NOT NULL,

    -- API configuration
    api_type TEXT NOT NULL DEFAULT 'openai',
    api_base TEXT,
    api_key_encrypted TEXT,

    -- Model settings
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    anony_only BOOLEAN NOT NULL DEFAULT true,
    weight INTEGER NOT NULL DEFAULT 100,

    -- Metadata
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_model_configs_model_key ON model_configs(model_key);
CREATE INDEX IF NOT EXISTS idx_model_configs_is_enabled ON model_configs(is_enabled) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_model_configs_deleted_at ON model_configs(deleted_at);

-- Update timestamp trigger (reuse existing function if available)
CREATE OR REPLACE FUNCTION update_model_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_model_configs_updated_at
BEFORE UPDATE ON model_configs
FOR EACH ROW
EXECUTE FUNCTION update_model_configs_updated_at();

-- RLS policies
ALTER TABLE model_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to model_configs"
ON model_configs FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Verification
SELECT 'model_configs table created successfully' AS status;
