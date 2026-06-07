-- IMU Database Migration: Create assignment_audit table
-- Records every successful assignment/unassignment mutation in the
-- group_role_members and group_caravan_municipalities tables, written by
-- the API layer (not by triggers — we want actor context).
-- Stage 1 of area-based RBAC rollout (spec 2026-06-07).

CREATE TABLE IF NOT EXISTS assignment_audit (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id       UUID NOT NULL REFERENCES users(id),
  action              TEXT NOT NULL,
  target_user_id      UUID REFERENCES users(id),
  target_group_id     UUID REFERENCES groups(id),
  target_province     TEXT,
  target_municipality TEXT,
  payload_json        JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_audit_actor
  ON assignment_audit(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_audit_target_user
  ON assignment_audit(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignment_audit_target_group
  ON assignment_audit(target_group_id, created_at DESC)
  WHERE target_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignment_audit_action
  ON assignment_audit(action, created_at DESC);

COMMENT ON TABLE assignment_audit IS
  'Audit trail for area-based RBAC assignment mutations. Written by the API '
  'layer on every successful POST/PATCH/DELETE on /api/groups/* endpoints. '
  'action examples: "member.assign","member.remove","caravan_municipalities.replace", '
  '"pool.add","pool.remove".';

SELECT 'Migration 122: assignment_audit table created' AS result;
