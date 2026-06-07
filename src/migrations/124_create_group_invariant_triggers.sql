-- IMU Database Migration: Cross-table invariant triggers for area-RBAC
-- These triggers enforce the data model invariants from spec 2026-06-07
-- that cannot be expressed as plain FKs (composite-key + soft-delete state).
-- Stage 1 of area-based RBAC rollout. Migration 123 added the
-- deleted_at column to group_municipalities that these triggers depend on.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_municipalities' AND column_name = 'province'
  ) THEN
    RAISE EXCEPTION 'group_municipalities.province column missing — schema drift';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_municipalities' AND column_name = 'municipality'
  ) THEN
    RAISE EXCEPTION 'group_municipalities.municipality column missing — schema drift';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_municipalities' AND column_name = 'deleted_at'
  ) THEN
    RAISE EXCEPTION 'group_municipalities.deleted_at column missing — apply migration 123 first';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- TRIGGER 1: validate group_caravan_municipalities INSERT/UPDATE
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gcm_validate_insert_update_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM group_municipalities
    WHERE group_id = NEW.group_id
      AND province = NEW.province
      AND municipality = NEW.municipality
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'municipality_not_in_group_pool'
      USING HINT = format('(province=%s, municipality=%s) is not in group_id=%s pool',
                          NEW.province, NEW.municipality, NEW.group_id),
            ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM group_role_members
    WHERE group_id = NEW.group_id
      AND user_id = NEW.caravan_user_id
      AND role_in_group = 'caravan'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'caravan_not_member_of_group'
      USING HINT = format('user_id=%s is not a live caravan in group_id=%s',
                          NEW.caravan_user_id, NEW.group_id),
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gcm_validate_insert_update ON group_caravan_municipalities;
CREATE TRIGGER gcm_validate_insert_update
  BEFORE INSERT OR UPDATE ON group_caravan_municipalities
  FOR EACH ROW
  EXECUTE FUNCTION gcm_validate_insert_update_fn();

-- ─────────────────────────────────────────────────────────────────────────
-- TRIGGER 2: block group_municipalities soft-delete with dependents
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gm_block_pool_removal_with_dependents_fn()
RETURNS TRIGGER AS $$
DECLARE
  dependent_count INT;
  dependent_json JSONB;
BEGIN
  IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*),
         COALESCE(jsonb_agg(jsonb_build_object(
           'caravan_user_id', gcm.caravan_user_id,
           'province',        gcm.province,
           'municipality',    gcm.municipality
         )), '[]'::jsonb)
    INTO dependent_count, dependent_json
    FROM group_caravan_municipalities gcm
   WHERE gcm.group_id = NEW.group_id
     AND gcm.province = NEW.province
     AND gcm.municipality = NEW.municipality
     AND gcm.deleted_at IS NULL;

  IF dependent_count > 0 THEN
    RAISE EXCEPTION 'group_pool_has_dependents'
      USING HINT = dependent_json::text,
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gm_block_pool_removal_with_dependents ON group_municipalities;
CREATE TRIGGER gm_block_pool_removal_with_dependents
  BEFORE UPDATE ON group_municipalities
  FOR EACH ROW
  EXECUTE FUNCTION gm_block_pool_removal_with_dependents_fn();

-- ─────────────────────────────────────────────────────────────────────────
-- TRIGGER 3: block group_role_members caravan soft-delete with slice rows
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION grm_block_caravan_member_removal_with_slices_fn()
RETURNS TRIGGER AS $$
DECLARE
  slice_count INT;
BEGIN
  IF OLD.role_in_group <> 'caravan'
     OR OLD.deleted_at IS NOT NULL
     OR NEW.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO slice_count
    FROM group_caravan_municipalities
   WHERE group_id = NEW.group_id
     AND caravan_user_id = NEW.user_id
     AND deleted_at IS NULL;

  IF slice_count > 0 THEN
    RAISE EXCEPTION 'caravan_member_has_active_slices'
      USING HINT = format('caravan_user_id=%s still has %s active slices in group_id=%s',
                          NEW.user_id, slice_count, NEW.group_id),
            ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grm_block_caravan_member_removal_with_slices ON group_role_members;
CREATE TRIGGER grm_block_caravan_member_removal_with_slices
  BEFORE UPDATE ON group_role_members
  FOR EACH ROW
  EXECUTE FUNCTION grm_block_caravan_member_removal_with_slices_fn();

SELECT 'Migration 124: group invariant triggers installed' AS result;
