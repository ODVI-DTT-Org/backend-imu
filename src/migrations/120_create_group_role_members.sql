-- IMU Database Migration: Create group_role_members table
-- Role-aware group membership. Replaces the inline groups.{area_manager_id,
-- assistant_area_manager_id, caravan_id, members} columns AND will eventually
-- supersede the legacy group_members table (renamed concept "caravan-in-group"
-- with client_id column). The legacy table is left untouched in Stage 1.
-- Stage 1 of area-based RBAC rollout (spec 2026-06-07).
-- Additive only — no data is moved here yet (Stage 2 backfill does that).

CREATE TABLE IF NOT EXISTS group_role_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_group TEXT NOT NULL CHECK (role_in_group IN (
    'area_head','assistant_area_head','team_leader','tele','caravan'
  )),
  assigned_at   TIMESTAMPTZ DEFAULT NOW(),
  assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_group_role_members_group_id
  ON group_role_members(group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_group_role_members_user_id
  ON group_role_members(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_group_role_members_role
  ON group_role_members(role_in_group) WHERE deleted_at IS NULL;

-- Cardinality: a team_leader can only be in one group at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_role_members_one_group_for_tl
  ON group_role_members(user_id)
  WHERE role_in_group = 'team_leader' AND deleted_at IS NULL;

-- Cardinality: a caravan can only be in one group at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_role_members_one_group_for_caravan
  ON group_role_members(user_id)
  WHERE role_in_group = 'caravan' AND deleted_at IS NULL;

-- A user cannot be assigned the same role twice in the same group
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_role_members_no_dup_per_group
  ON group_role_members(group_id, user_id, role_in_group)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE group_role_members IS
  'Role-aware membership of users in groups (area-based RBAC). '
  'Distinct from the legacy group_members table (which uses client_id and joined_at).';

SELECT 'Migration 120: group_role_members table created' AS result;
