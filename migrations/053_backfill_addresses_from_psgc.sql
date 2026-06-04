-- Migration 053: Backfill primary address records from client PSGC fields
-- Date: 2026-05-22
--
-- Creates one 'home' address record marked as primary for every client that:
--   1. Has a psgc_id (confirmed PSGC-matched location)
--   2. Has at least one of: municipality, barangay, province
--   3. Is not soft-deleted
--   4. Has NO existing active (non-deleted) address record
--
-- This fixes the client detail page showing no address for clients whose
-- address exists only as flat PSGC columns on the clients row.
--
-- Safe to re-run: the NOT EXISTS guard and ON CONFLICT DO NOTHING make it idempotent.

BEGIN;

INSERT INTO addresses (
  id,
  client_id,
  type,
  street,
  barangay,
  city,
  province,
  is_primary,
  psgc_id,
  created_at,
  updated_at
)
SELECT
  uuid_generate_v4(),
  c.id,
  'home',
  c.full_address,         -- best available street-level text for this client
  c.barangay,
  c.municipality,
  c.province,
  TRUE,
  c.psgc_id,
  NOW(),
  NOW()
FROM clients c
WHERE c.psgc_id IS NOT NULL
  AND (
    c.municipality IS NOT NULL
    OR c.barangay   IS NOT NULL
    OR c.province   IS NOT NULL
  )
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM addresses a
    WHERE a.client_id = c.id
      AND a.deleted_at IS NULL
  )
ON CONFLICT DO NOTHING;

-- Report how many rows were inserted
DO $$
DECLARE
  inserted_count INTEGER;
BEGIN
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'Migration 053: % address record(s) inserted', inserted_count;
END $$;

COMMIT;
