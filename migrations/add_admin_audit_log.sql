-- Migration: Add admin_audit_log table
-- Phase: Admin UI - Audit Logging
-- Description: Track all admin actions for security and debugging

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details JSONB DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at);

-- RLS policies
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to admin_audit_log"
ON admin_audit_log FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Verification
SELECT 'admin_audit_log table created successfully' AS status;
