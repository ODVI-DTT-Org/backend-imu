-- Migration: Fix groups team_leader_id to reference caravans instead of users
-- Date: 2025-03-24
-- Issue: GroupFormView was showing caravans for team leader selection, but database referenced users table
-- Solution: Change foreign key constraint to reference caravans table

BEGIN;

-- Drop existing foreign key constraint
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_team_leader_id_fkey;

-- Add new foreign key constraint referencing caravans
ALTER TABLE groups ADD CONSTRAINT groups_team_leader_id_fkey
  FOREIGN KEY (team_leader_id) REFERENCES caravans(id) ON DELETE SET NULL;

COMMIT;

-- Verification query
-- SELECT table_name, constraint_name, foreign_table_name
-- FROM information_schema.table_constraints
-- WHERE table_name = 'groups' AND constraint_type = 'FOREIGN KEY';
