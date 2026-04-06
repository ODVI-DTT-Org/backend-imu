-- Migration: Create scheduled_reports table for recurring Excel reports
-- Date: 2026-04-06
-- Description: Stores scheduled report configurations

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  frequency TEXT NOT NULL,
  params JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT scheduled_reports_frequency_check
    CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  CONSTRAINT scheduled_reports_type_check
    CHECK (report_type IN ('performance', 'clients', 'touchpoints', 'itineraries'))
);

-- Indexes for performance
CREATE INDEX idx_scheduled_reports_created_by ON scheduled_reports(created_by);
CREATE INDEX idx_scheduled_reports_is_active ON scheduled_reports(is_active);
CREATE INDEX idx_scheduled_reports_next_run_at ON scheduled_reports(next_run_at) WHERE is_active = true;
CREATE INDEX idx_scheduled_reports_frequency ON scheduled_reports(frequency);

-- Comment
COMMENT ON TABLE scheduled_reports IS 'Stores scheduled Excel report configurations with recurring frequencies';
COMMENT ON COLUMN scheduled_reports.name IS 'Human-readable name for the scheduled report';
COMMENT ON COLUMN scheduled_reports.report_type IS 'Type of report: performance, clients, touchpoints, or itineraries';
COMMENT ON COLUMN scheduled_reports.frequency IS 'How often to run: daily, weekly, or monthly';
COMMENT ON COLUMN scheduled_reports.params IS 'Report parameters (filters, columns, recipients, etc.)';
COMMENT ON COLUMN scheduled_reports.is_active IS 'Whether the schedule is currently active';
COMMENT ON COLUMN scheduled_reports.last_run_at IS 'Timestamp of the most recent run';
COMMENT ON COLUMN scheduled_reports.next_run_at IS 'Timestamp when the next run is scheduled';
