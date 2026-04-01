-- IMU Database Schema Improvements
-- Run this script to add missing indexes, constraints, and tables

-- ============================================
-- 1. MISSING INDEXES
-- ============================================

-- User profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Clients
CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON clients(agency_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);

-- Touchpoints
CREATE INDEX IF NOT EXISTS idx_touchpoints_date ON touchpoints(date);
CREATE INDEX IF NOT EXISTS idx_touchpoints_type ON touchpoints(type);

-- Itineraries
CREATE INDEX IF NOT EXISTS idx_itineraries_client_id ON itineraries(client_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_status ON itineraries(status);
CREATE INDEX IF NOT EXISTS idx_itineraries_scheduled_date ON itineraries(scheduled_date);

-- Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- Groups
CREATE INDEX IF NOT EXISTS idx_groups_caravan_id ON groups(caravan_id);

-- Targets - unique index for upsert (may already exist)
CREATE UNIQUE INDEX IF NOT EXISTS targets_user_period_year_month_week_idx
ON targets (user_id, period, year, COALESCE(month, 0), COALESCE(week, 0));

-- ============================================
-- 2. MISSING CONSTRAINTS
-- ============================================

-- Touchpoint number must be 1-7
ALTER TABLE touchpoints DROP CONSTRAINT IF EXISTS chk_touchpoint_number;
ALTER TABLE touchpoints ADD CONSTRAINT chk_touchpoint_number
CHECK (touchpoint_number >= 1 AND touchpoint_number <= 7);

-- Status constraints
ALTER TABLE approvals DROP CONSTRAINT IF EXISTS chk_approvals_status;
ALTER TABLE approvals ADD CONSTRAINT chk_approvals_status
CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE approvals DROP CONSTRAINT IF EXISTS chk_approvals_type;
ALTER TABLE approvals ADD CONSTRAINT chk_approvals_type
CHECK (type IN ('client', 'udi'));

-- ============================================
-- 3. SOFT DELETE COLUMNS
-- ============================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE touchpoints ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Indexes for soft delete queries
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at);
CREATE INDEX IF NOT EXISTS idx_touchpoints_deleted_at ON touchpoints(deleted_at);
CREATE INDEX IF NOT EXISTS idx_itineraries_deleted_at ON itineraries(deleted_at);

-- ============================================
-- 4. AUDIT LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================
-- 5. SYSTEM SETTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- Insert default settings
INSERT INTO system_settings (key, value, description) VALUES
  ('app.name', '"IMU"', 'Application name'),
  ('app.version', '"1.0.0"', 'Application version'),
  ('auth.session_timeout', '28800', 'Session timeout in seconds (8 hours)'),
  ('auth.lockout_threshold', '5', 'Failed login attempts before lockout'),
  ('auth.password_min_length', '8', 'Minimum password length'),
  ('upload.max_file_size', '10485760', 'Maximum file upload size in bytes (10MB)'),
  ('sync.interval', '300', 'Sync interval in seconds')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 6. FILES TABLE (for tracking uploads)
-- ============================================

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  url TEXT NOT NULL,
  storage_key TEXT,
  storage_provider TEXT DEFAULT 'local',
  uploaded_by UUID REFERENCES users(id),
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_entity ON files(entity_type, entity_id);

-- ============================================
-- 7. NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- ============================================
-- 8. UPDATED AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables that don't have them
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agencies_updated_at') THEN
    CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON agencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_groups_updated_at') THEN
    CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_targets_updated_at') THEN
    CREATE TRIGGER update_targets_updated_at BEFORE UPDATE ON targets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================
-- 9. VIEWS FOR COMMON QUERIES
-- ============================================

-- Dashboard stats view
CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL) as total_clients,
  (SELECT COUNT(*) FROM clients WHERE client_type = 'POTENTIAL' AND deleted_at IS NULL) as potential_clients,
  (SELECT COUNT(*) FROM clients WHERE client_type = 'EXISTING' AND deleted_at IS NULL) as existing_clients,
  (SELECT COUNT(*) FROM touchpoints WHERE deleted_at IS NULL) as total_touchpoints,
  (SELECT COUNT(*) FROM itineraries WHERE deleted_at IS NULL AND scheduled_date = CURRENT_DATE) as today_itineraries,
  (SELECT COUNT(*) FROM users WHERE role = 'field_agent') as total_caravans;

-- Approval stats view
CREATE OR REPLACE VIEW v_approval_stats AS
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'approved') as approved,
  COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
  COUNT(*) FILTER (WHERE type = 'client') as client_approvals,
  COUNT(*) FILTER (WHERE type = 'udi') as udi_approvals
FROM approvals;

SELECT 'Schema improvements applied successfully!' as result;
