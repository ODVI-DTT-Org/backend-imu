-- Migration: Create report_jobs table for Excel report generation
-- Date: 2026-04-06
-- Description: Stores report generation jobs with status tracking

CREATE TABLE IF NOT EXISTS report_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  params JSONB DEFAULT '{}',
  result JSONB,
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  file_url TEXT,
  file_size BIGINT,

  -- Constraints
  CONSTRAINT report_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT report_jobs_type_check
    CHECK (report_type IN ('quick', 'custom', 'scheduled'))
);

-- Indexes for performance
CREATE INDEX idx_report_jobs_status ON report_jobs(status);
CREATE INDEX idx_report_jobs_created_by ON report_jobs(created_by);
CREATE INDEX idx_report_jobs_created_at ON report_jobs(created_at DESC);
CREATE INDEX idx_report_jobs_report_type ON report_jobs(report_type);

-- Comment
COMMENT ON TABLE report_jobs IS 'Stores Excel report generation jobs with BullMQ queue integration';
COMMENT ON COLUMN report_jobs.report_type IS 'Type of report: quick (preset), custom (user-selected), or scheduled (recurring)';
COMMENT ON COLUMN report_jobs.status IS 'Job status: pending, processing, completed, or failed';
COMMENT ON COLUMN report_jobs.params IS 'Report parameters (date range, filters, columns, etc.)';
COMMENT ON COLUMN report_jobs.result IS 'Report result metadata (row count, columns, etc.)';
COMMENT ON COLUMN report_jobs.file_url IS 'S3 presigned URL for generated Excel file';
COMMENT ON COLUMN report_jobs.file_size IS 'File size in bytes';
