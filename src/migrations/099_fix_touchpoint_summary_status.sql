-- ============================================
-- Migration 099: Fix touchpoint_summary.status field
-- ============================================
-- Problem: The trigger that populates clients.touchpoint_summary built each
-- element's "status" from touchpoints.status (always NULL for new records) and
-- did not capture the interest level stored in visits.reason / calls.reason for
-- legacy records. The visit_status filter on GET /api/clients was therefore
-- always returning an empty result set.
--
-- Fix:
--   1. Update trigger function to JOIN visits/calls and resolve the interest
--      level from the correct source: COALESCE(v.status, ca.status, t.status).
--      Also expose visits.reason / calls.reason in the JSONB so it mirrors
--      what legacy touchpoint_summary rows already carry.
--   2. Fix the DELETE trigger path: original trigger used NEW.client_id which
--      is NULL for DELETE triggers; replaced with COALESCE(NEW.client_id, OLD.client_id).
--   3. Backfill all existing clients.touchpoint_summary rows.
-- ============================================

BEGIN;

-- 1. Replace the trigger function
DROP FUNCTION IF EXISTS update_client_touchpoint_summary() CASCADE;

CREATE OR REPLACE FUNCTION update_client_touchpoint_summary()
RETURNS TRIGGER AS $$
DECLARE
  client_touchpoints JSONB;
  tp_count INTEGER;
  next_tp_num INTEGER;
  next_tp_type VARCHAR(10);
  affected_client_id UUID;
BEGIN
  -- Support INSERT/UPDATE (NEW) and DELETE (OLD)
  affected_client_id := COALESCE(NEW.client_id, OLD.client_id);

  IF affected_client_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Aggregate all touchpoints, resolving interest-level status and reason
  -- from the linked visits/calls rows (touchpoints.status is not populated).
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                t.id,
      'touchpoint_number', t.touchpoint_number,
      'type',              t.type,
      'date',              t.date,
      'rejection_reason',  COALESCE(t.rejection_reason, ''),
      'status',            COALESCE(v.status, ca.status, t.status, ''),
      'reason',            COALESCE(v.reason, ca.reason, ''),
      'user_id',           t.user_id,
      'visit_id',          t.visit_id,
      'call_id',           t.call_id,
      'created_at',        t.created_at,
      'updated_at',        t.updated_at,
      'is_legacy',         t.is_legacy
    ) ORDER BY t.touchpoint_number
  )
  INTO client_touchpoints
  FROM touchpoints t
  LEFT JOIN visits v  ON v.id  = t.visit_id
  LEFT JOIN calls  ca ON ca.id = t.call_id
  WHERE t.client_id = affected_client_id;

  SELECT COALESCE(jsonb_array_length(client_touchpoints), 0)
  INTO tp_count;

  IF tp_count >= 7 THEN
    next_tp_num  := 7;
    next_tp_type := NULL;
  ELSE
    next_tp_num := tp_count + 1;
    CASE next_tp_num
      WHEN 1 THEN next_tp_type := 'Visit';
      WHEN 2 THEN next_tp_type := 'Call';
      WHEN 3 THEN next_tp_type := 'Call';
      WHEN 4 THEN next_tp_type := 'Visit';
      WHEN 5 THEN next_tp_type := 'Call';
      WHEN 6 THEN next_tp_type := 'Call';
      WHEN 7 THEN next_tp_type := 'Visit';
      ELSE        next_tp_type := 'Visit';
    END CASE;
  END IF;

  UPDATE clients
  SET
    touchpoint_summary = COALESCE(client_touchpoints, '[]'::jsonb),
    touchpoint_number  = tp_count,
    next_touchpoint    = next_tp_type,
    updated_at         = NOW()
  WHERE id = affected_client_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 2. Re-attach triggers
DROP TRIGGER IF EXISTS trigger_touchpoint_insert_update_client ON touchpoints;
DROP TRIGGER IF EXISTS trigger_touchpoint_update_update_client ON touchpoints;
DROP TRIGGER IF EXISTS trigger_touchpoint_delete_update_client ON touchpoints;

CREATE TRIGGER trigger_touchpoint_insert_update_client
  AFTER INSERT ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

CREATE TRIGGER trigger_touchpoint_update_update_client
  AFTER UPDATE ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

CREATE TRIGGER trigger_touchpoint_delete_update_client
  AFTER DELETE ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION update_client_touchpoint_summary();

-- 3. Backfill all existing rows (only affects clients with touchpoints rows;
--    legacy clients whose data lives entirely in touchpoint_summary JSONB are
--    unchanged because they have no touchpoints rows to aggregate).
UPDATE clients c
SET touchpoint_summary = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',                t.id,
        'touchpoint_number', t.touchpoint_number,
        'type',              t.type,
        'date',              t.date,
        'rejection_reason',  COALESCE(t.rejection_reason, ''),
        'status',            COALESCE(v.status, ca.status, t.status, ''),
        'reason',            COALESCE(v.reason, ca.reason, ''),
        'user_id',           t.user_id,
        'visit_id',          t.visit_id,
        'call_id',           t.call_id,
        'created_at',        t.created_at,
        'updated_at',        t.updated_at,
        'is_legacy',         t.is_legacy
      ) ORDER BY t.touchpoint_number
    )
    FROM touchpoints t
    LEFT JOIN visits v  ON v.id  = t.visit_id
    LEFT JOIN calls  ca ON ca.id = t.call_id
    WHERE t.client_id = c.id
  ),
  c.touchpoint_summary  -- preserve existing JSONB for clients with no touchpoints rows
)
WHERE EXISTS (SELECT 1 FROM touchpoints WHERE client_id = c.id);

COMMIT;
