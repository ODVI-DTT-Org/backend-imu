-- Migration 097: Password reset requests table
-- Tracks mobile users who have requested a password reset via the admin-notification flow.

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES users(id) ON DELETE CASCADE,
  username_submitted TEXT   NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'completed', 'dismissed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  completed_by  UUID        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_prr_status     ON password_reset_requests(status);
CREATE INDEX idx_prr_user_id    ON password_reset_requests(user_id);
CREATE INDEX idx_prr_created_at ON password_reset_requests(created_at DESC);

-- Rollback:
-- DROP TABLE IF EXISTS password_reset_requests;
