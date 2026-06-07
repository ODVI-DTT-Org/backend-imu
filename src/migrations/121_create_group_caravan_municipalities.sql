-- IMU Database Migration: Create group_caravan_municipalities table
-- Holds the caravan's slice of municipalities within their group, keyed by
-- (province, municipality) to match the existing group_municipalities schema
-- (see migration 046 which dropped the older municipality_id column).
-- Invariants are enforced by triggers added in migration 123.
-- Stage 1 of area-based RBAC rollout (spec 2026-06-07).

CREATE TABLE IF NOT EXISTS group_caravan_municipalities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  caravan_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  province        TEXT NOT NULL,
  municipality    TEXT NOT NULL,
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  assigned_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gcm_group_id
  ON group_caravan_municipalities(group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gcm_caravan_user_id
  ON group_caravan_municipalities(caravan_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gcm_location
  ON group_caravan_municipalities(province, municipality) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gcm_no_dup
  ON group_caravan_municipalities(group_id, caravan_user_id, province, municipality)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE group_caravan_municipalities IS
  'Caravan-level municipality assignment, scoped to a group. '
  '(province, municipality) must exist in group_municipalities for the same group. '
  'Invariants enforced by triggers in migration 123.';

SELECT 'Migration 121: group_caravan_municipalities table created' AS result;
