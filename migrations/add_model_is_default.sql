-- Migration: Add is_default column to model_configs
-- Purpose: Allow admins to designate a default model for the Model Selector feature

-- Add is_default column
ALTER TABLE model_configs ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Create unique partial index to ensure only one default model at a time
-- This constraint only applies to non-deleted models
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_configs_single_default
ON model_configs (is_default)
WHERE is_default = true AND deleted_at IS NULL;

-- Note: To set a model as default, first unset any existing default:
-- UPDATE model_configs SET is_default = false WHERE is_default = true;
-- UPDATE model_configs SET is_default = true WHERE id = '<model-uuid>';
