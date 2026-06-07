-- IMU Database Migration: Add deleted_at + assigned_by to group_municipalities
-- Required by area-RBAC stage 1 invariant triggers (migration 124).
-- Additive only. No backfill needed — existing rows have NULL deleted_at (live)
-- and NULL assigned_by (unknown actor, acceptable for pre-existing data).
-- See spec docs/superpowers/specs/2026-06-07-area-rbac-group-assignment-design.md

ALTER TABLE group_municipalities
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_group_municipalities_deleted_at
  ON group_municipalities(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON COLUMN group_municipalities.deleted_at IS
  'Soft-delete marker. NULL = live, NOT NULL = removed from pool. '
  'Set by admin via DELETE /api/groups/:groupId/municipalities. '
  'Existing queries must add WHERE deleted_at IS NULL during Stage 3 read switch.';

SELECT 'Migration 123: group_municipalities soft-delete columns added' AS result;
