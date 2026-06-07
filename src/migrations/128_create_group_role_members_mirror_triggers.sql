-- Migration 128: Mirror triggers from legacy schema → group_role_members.
-- These triggers keep group_role_members in sync with the existing schema
-- so the existing Vue admin UI (which writes to legacy group_members and
-- groups.area_manager_id / assistant_area_manager_id) continues to produce
-- correct RBAC data without changing the UI.
-- Stage 3a of area-based RBAC rollout (spec 2026-06-07).
-- Idempotent (CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- TRIGGER 1: legacy group_members → group_role_members(role='caravan')
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mirror_group_members_to_role_members_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
    VALUES (NEW.group_id, NEW.client_id, 'caravan', NULL)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Hard-deleting from legacy → soft-delete the mirror caravan row
    -- (but only if the user isn't ALSO an area_head/assistant_area_head/team_leader
    --  in the same group — those rows are owned by other paths)
    UPDATE group_role_members
       SET deleted_at = NOW()
     WHERE group_id = OLD.group_id
       AND user_id = OLD.client_id
       AND role_in_group = 'caravan'
       AND deleted_at IS NULL;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.group_id <> NEW.group_id THEN
    -- Group reassignment: soft-delete old, insert new
    UPDATE group_role_members
       SET deleted_at = NOW()
     WHERE group_id = OLD.group_id
       AND user_id = OLD.client_id
       AND role_in_group = 'caravan'
       AND deleted_at IS NULL;
    INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
    VALUES (NEW.group_id, NEW.client_id, 'caravan', NULL)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mirror_group_members_to_role_members ON group_members;
CREATE TRIGGER mirror_group_members_to_role_members
  AFTER INSERT OR UPDATE OR DELETE ON group_members
  FOR EACH ROW
  EXECUTE FUNCTION mirror_group_members_to_role_members_fn();

-- ─────────────────────────────────────────────────────────────────────────
-- TRIGGER 2: groups.area_manager_id / assistant_area_manager_id UPDATE
--           → group_role_members(role='area_head' or 'assistant_area_head')
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mirror_groups_manager_columns_fn()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle area_manager_id changes
  IF OLD.area_manager_id IS DISTINCT FROM NEW.area_manager_id THEN
    -- Soft-delete the previous mapping (if any)
    IF OLD.area_manager_id IS NOT NULL THEN
      UPDATE group_role_members
         SET deleted_at = NOW()
       WHERE group_id = OLD.id
         AND user_id = OLD.area_manager_id
         AND role_in_group = 'area_head'
         AND deleted_at IS NULL;
    END IF;
    -- Insert the new mapping (if any)
    IF NEW.area_manager_id IS NOT NULL THEN
      INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
      VALUES (NEW.id, NEW.area_manager_id, 'area_head', NULL)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Handle assistant_area_manager_id changes (same pattern)
  IF OLD.assistant_area_manager_id IS DISTINCT FROM NEW.assistant_area_manager_id THEN
    IF OLD.assistant_area_manager_id IS NOT NULL THEN
      UPDATE group_role_members
         SET deleted_at = NOW()
       WHERE group_id = OLD.id
         AND user_id = OLD.assistant_area_manager_id
         AND role_in_group = 'assistant_area_head'
         AND deleted_at IS NULL;
    END IF;
    IF NEW.assistant_area_manager_id IS NOT NULL THEN
      INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
      VALUES (NEW.id, NEW.assistant_area_manager_id, 'assistant_area_head', NULL)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mirror_groups_manager_columns ON groups;
CREATE TRIGGER mirror_groups_manager_columns
  AFTER UPDATE ON groups
  FOR EACH ROW
  EXECUTE FUNCTION mirror_groups_manager_columns_fn();

-- Also fire on INSERT — admin can create a group with area_manager_id pre-set
CREATE OR REPLACE FUNCTION mirror_groups_manager_columns_insert_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.area_manager_id IS NOT NULL THEN
    INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
    VALUES (NEW.id, NEW.area_manager_id, 'area_head', NULL)
    ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.assistant_area_manager_id IS NOT NULL THEN
    INSERT INTO group_role_members (group_id, user_id, role_in_group, assigned_by)
    VALUES (NEW.id, NEW.assistant_area_manager_id, 'assistant_area_head', NULL)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mirror_groups_manager_columns_insert ON groups;
CREATE TRIGGER mirror_groups_manager_columns_insert
  AFTER INSERT ON groups
  FOR EACH ROW
  EXECUTE FUNCTION mirror_groups_manager_columns_insert_fn();

COMMIT;

SELECT 'Migration 128: mirror triggers installed' AS result;
