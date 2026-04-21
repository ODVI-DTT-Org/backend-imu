-- Rollback: Unli Touchpoint CMS Migration
-- Date: 2026-04-21
-- Description: Remove migrated touchpoints

BEGIN;

-- Identify migrated records
SELECT COUNT(*) as migrated_count
FROM touchpoints
WHERE migrated_from_cms = TRUE;

-- Option A: Delete migrated records
DELETE FROM touchpoints
WHERE migrated_from_cms = TRUE;

-- Verify rollback
SELECT COUNT(*) as remaining_touchpoints FROM touchpoints;
SELECT COUNT(*) as migrated_remaining FROM touchpoints WHERE migrated_from_cms = TRUE;

COMMIT;
