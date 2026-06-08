-- Migration 120: Backfill addresses table from clients.full_address
--
-- Purpose
-- -------
-- PCNICMS-imported clients carry their address as a single denormalized
-- string in clients.full_address. The mobile/web UI now drives display
-- and "set as primary" off the addresses table. This migration copies the
-- legacy string into addresses as a CMS-typed row so those clients have
-- a real, selectable address record.
--
-- Behavior
-- --------
-- For each client where:
--   * clients.full_address is non-empty
--   * clients.deleted_at IS NULL
--   * the client does NOT already have a 'CMS'-typed address row
-- insert a new addresses row with:
--   * type           = 'CMS'
--   * street         = clients.full_address  (raw, no parsing)
--   * street_address = clients.full_address  (legacy column kept in sync)
--   * psgc_id        = NULL                  (no PSGC tag, per spec)
--   * barangay/city/province = NULL          (no parsing)
--   * is_primary     = true if the client has no other address rows;
--                       false otherwise (don't disturb existing primary)
--
-- Idempotent: re-running the migration is a no-op because the NOT EXISTS
-- guard skips any client that already has a CMS row.
--
-- Constraints respected
-- ---------------------
--   * idx_addresses_unique_type_per_client (UNIQUE on client_id, type
--     where deleted_at IS NULL) — guard ensures only one CMS row per client
--   * ensure_single_primary_address trigger — we only set is_primary=true
--     when no other row exists, so the trigger has nothing to clear

BEGIN;

WITH eligible AS (
  SELECT
    c.id                                                                 AS client_id,
    c.full_address                                                       AS full_address,
    NOT EXISTS (
      SELECT 1 FROM addresses a
      WHERE a.client_id = c.id
        AND a.deleted_at IS NULL
    )                                                                    AS no_existing_address
  FROM clients c
  WHERE c.full_address IS NOT NULL
    AND btrim(c.full_address) <> ''
    AND c.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM addresses a
      WHERE a.client_id = c.id
        AND a.type = 'CMS'
        AND a.deleted_at IS NULL
    )
)
INSERT INTO addresses (
  id,
  client_id,
  type,
  street,
  street_address,
  is_primary,
  created_at,
  updated_at
)
SELECT
  uuid_generate_v4(),
  e.client_id,
  'CMS',
  e.full_address,
  e.full_address,
  e.no_existing_address,
  NOW(),
  NOW()
FROM eligible e;

-- Report: how many CMS rows now exist (cumulative across runs).
SELECT
  'Migration 120: ' || COUNT(*) || ' CMS addresses present after backfill' AS result
FROM addresses
WHERE type = 'CMS'
  AND deleted_at IS NULL;

COMMIT;
