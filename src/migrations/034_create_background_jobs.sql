-- Create background_jobs table for async job processing
CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'psgc_matching', 'report_generation'
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  params JSONB,
  result JSONB,
  error TEXT,
  progress INTEGER DEFAULT 0,
  total_items INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_background_jobs_type_status ON background_jobs(type, status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_by ON background_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_at ON background_jobs(created_at DESC);

-- Add comment
COMMENT ON TABLE background_jobs IS 'Background job tracking for long-running operations like PSGC matching and report generation';
