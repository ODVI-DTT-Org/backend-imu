CREATE TABLE IF NOT EXISTS feedback_reports (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT,
  user_email  TEXT,
  user_name   TEXT,
  type        VARCHAR(24)  NOT NULL,
  title       VARCHAR(160) NOT NULL,
  description TEXT         NOT NULL,
  severity    VARCHAR(16),
  status      VARCHAR(24)  NOT NULL DEFAULT 'open',
  screenshot_path TEXT,
  context     JSONB,
  notify_user BOOLEAN      NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_type_status    ON feedback_reports (type, status);
