-- Migration 115: Recompute visit odometer fields per revised spec
--
-- New spec (replacing yesterday's Choice 3 formula):
--   odometer_departure  = NULL always (stop populating; column kept for back-compat)
--   kilometers_traveled = current.arrival - previous.arrival
--                         where previous = same user_id, same time_in::date,
--                         immediately before current by time_in
--   First visit of user-day → '0'
--   NULL/empty arrival    → leave km_traveled NULL (don't fabricate)
--
-- Apply manually:
--   psql ... -f 115_recompute_visit_odometers.sql
-- After applying, insert into migration_log.

BEGIN;

-- Preview (dry run): inspect a sample before committing.
/*
WITH ordered AS (
  SELECT
    id,
    user_id,
    time_in,
    odometer_arrival,
    odometer_departure,
    kilometers_traveled,
    LAG(NULLIF(odometer_arrival, '')::numeric)
      OVER (PARTITION BY user_id, time_in::date ORDER BY time_in, created_at) AS prev_arrival
  FROM visits
  WHERE odometer_arrival IS NOT NULL AND odometer_arrival != ''
)
SELECT
  id,
  user_id,
  time_in::date                                          AS visit_date,
  odometer_arrival,
  odometer_departure                                     AS old_departure,
  kilometers_traveled                                    AS old_km,
  CASE
    WHEN prev_arrival IS NULL THEN '0'
    ELSE (NULLIF(odometer_arrival,'')::numeric - prev_arrival)::text
  END                                                    AS new_km
FROM ordered
ORDER BY user_id, time_in
LIMIT 30;
*/

-- Actual update: nullify departure, recompute km via LAG().
WITH ordered AS (
  SELECT
    id,
    LAG(NULLIF(odometer_arrival, '')::numeric)
      OVER (PARTITION BY user_id, time_in::date ORDER BY time_in, created_at) AS prev_arrival,
    NULLIF(odometer_arrival, '')::numeric                                       AS curr_arrival
  FROM visits
),
computed AS (
  SELECT
    id,
    CASE
      WHEN curr_arrival IS NULL   THEN NULL            -- no arrival → km stays NULL
      WHEN prev_arrival IS NULL   THEN '0'             -- first visit of day
      ELSE (curr_arrival - prev_arrival)::text
    END AS new_km
  FROM ordered
)
UPDATE visits v
SET
  odometer_departure  = NULL,
  kilometers_traveled = c.new_km,
  updated_at          = NOW()
FROM computed c
WHERE v.id = c.id;

-- Record migration
INSERT INTO migration_log (script_name, status, completed_at)
VALUES ('115_recompute_visit_odometers', 'completed', NOW());

COMMIT;

-- Post-apply verification:
-- 1. Confirm no departure values remain:
--    SELECT COUNT(*) FROM visits WHERE odometer_departure IS NOT NULL AND odometer_departure != '';
-- 2. Sample km values for a known user-day:
--    SELECT user_id, time_in, odometer_arrival, kilometers_traveled FROM visits WHERE time_in::date = '2026-06-01' ORDER BY user_id, time_in LIMIT 20;
