-- Migration 1108: backfill client_type and market_type from historical touchpoint/release activity
--
-- The lifecycle trigger (1104) and backend handlers (lifecycle.service.ts) only
-- promote clients on NEW touchpoint/release inserts. Clients with pre-deploy
-- activity stayed at client_type='POTENTIAL', market_type='VIRGIN'. That makes
-- the FAVORABLE filter return zero matches even though many clients have a
-- favorable last touchpoint.
--
-- This migration computes the steady-state lifecycle classification from
-- existing touchpoint / release rows:
--
-- client_type ← compute_client_type_from_category(latest touchpoint's reason category)
-- market_type ←
--   - ≥2 releases     → EXISTING
--   - 1 release       → FULLY-PAID
--   - ≥1 touchpoint   → TOUCHED
--   - else            → VIRGIN (unchanged)
--
-- Does NOT write client_status_history rows — these are backfill, not transitions.
-- compute_client_type_from_category() was created by migration 1104.

BEGIN;

-- 1. Backfill market_type from release count + touchpoint presence
WITH client_activity AS (
  SELECT
    c.id,
    c.market_type AS current_market_type,
    EXISTS (SELECT 1 FROM touchpoints t WHERE t.client_id = c.id) AS has_touchpoint,
    (SELECT COUNT(*) FROM releases r WHERE r.client_id = c.id) AS release_count
  FROM clients c
  WHERE c.deleted_at IS NULL
), targets AS (
  SELECT
    ca.id,
    ca.current_market_type,
    CASE
      WHEN ca.release_count >= 2 THEN 'EXISTING'::market_type_enum
      WHEN ca.release_count = 1 THEN 'FULLY-PAID'::market_type_enum
      WHEN ca.has_touchpoint   THEN 'TOUCHED'::market_type_enum
      ELSE NULL
    END AS new_market_type
  FROM client_activity ca
)
UPDATE clients c
SET market_type = t.new_market_type,
    updated_at = NOW()
FROM targets t
WHERE c.id = t.id
  AND t.new_market_type IS NOT NULL
  AND t.new_market_type IS DISTINCT FROM c.market_type;

-- 2. Backfill client_type from latest touchpoint's reason category
WITH last_touch AS (
  SELECT DISTINCT ON (t.client_id)
    t.client_id,
    tr.category
  FROM touchpoints t
  LEFT JOIN visits v  ON v.id  = t.visit_id
  LEFT JOIN calls  ca ON ca.id = t.call_id
  LEFT JOIN touchpoint_reasons tr
    ON tr.reason_code = COALESCE(v.reason, ca.reason)
  ORDER BY t.client_id, t.date DESC NULLS LAST, t.created_at DESC
), targets AS (
  SELECT
    lt.client_id,
    compute_client_type_from_category(lt.category) AS new_client_type
  FROM last_touch lt
  WHERE lt.category IS NOT NULL
)
UPDATE clients c
SET client_type = t.new_client_type,
    updated_at = NOW()
FROM targets t
WHERE c.id = t.client_id
  AND t.new_client_type IS NOT NULL
  AND t.new_client_type IS DISTINCT FROM c.client_type;

INSERT INTO migration_log (script_name, status, completed_at, details)
VALUES ('1108_backfill_lifecycle_from_history', 'completed', now(),
  jsonb_build_object(
    'note',
    'Backfilled client_type from latest touchpoint category and market_type from touchpoint/release counts. Reason: lifecycle trigger only promotes on new inserts, so pre-deploy clients showed as POTENTIAL/VIRGIN and the FAVORABLE filter returned zero.'
  ));

COMMIT;
