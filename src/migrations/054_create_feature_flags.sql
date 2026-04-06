/**
 * Migration 054: Create Feature Flags System
 *
 * Creates the feature_flags table for controlled rollout of new features.
 * Supports environment, role, user, and percentage-based rollouts.
 */

-- Create feature_flags table
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  enabled BOOLEAN DEFAULT false NOT NULL,
  user_whitelist TEXT[] DEFAULT '{}',
  role_whitelist TEXT[] DEFAULT '{}',
  environment_whitelist TEXT[] DEFAULT '{}',
  percentage INTEGER DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_feature_flags_enabled ON feature_flags(enabled) WHERE enabled = true;
CREATE INDEX idx_feature_flags_name ON feature_flags(name);
CREATE INDEX idx_feature_flags_environment ON feature_flags USING GIN(environment_whitelist);
CREATE INDEX idx_feature_flags_role ON feature_flags USING GIN(role_whitelist);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flags_updated_at();

-- Insert default feature flags for the dashboard
INSERT INTO feature_flags (name, description, enabled, environment_whitelist, role_whitelist, percentage) VALUES
  (
    'dashboard_redesign',
    'New dashboard with target progress, team performance, and action items',
    true,
    ARRAY['development', 'qa'],
    ARRAY['admin', 'area_manager', 'assistant_area_manager'],
    100
  ),
  (
    'target_tracking',
    'Target progress tracking with period-based goals',
    true,
    ARRAY['development', 'qa'],
    ARRAY['admin', 'area_manager'],
    50
  ),
  (
    'team_performance',
    'Team performance rankings and metrics',
    true,
    ARRAY['development', 'qa'],
    ARRAY['admin', 'area_manager'],
    50
  ),
  (
    'action_items_drawer',
    'Action items drawer with priority filtering',
    true,
    ARRAY['development', 'qa', 'production'],
    ARRAY['admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'],
    100
  )
ON CONFLICT (name) DO NOTHING;

-- Add comment
COMMENT ON TABLE feature_flags IS 'Feature flag system for controlled rollout of new features';
COMMENT ON COLUMN feature_flags.user_whitelist IS 'List of user IDs who have access to the feature';
COMMENT ON COLUMN feature_flags.role_whitelist IS 'List of roles who have access to the feature';
COMMENT ON COLUMN feature_flags.environment_whitelist IS 'List of environments (dev, qa, prod) where the feature is available';
COMMENT ON COLUMN feature_flags.percentage IS 'Percentage rollout (0-100) for gradual deployment';
