-- ============================================
-- Migration 074: Backfill Touchpoint Summary for Existing Clients
-- ============================================
-- Purpose: Populate touchpoint_summary, touchpoint_number, and next_touchpoint
--          for clients who already have touchpoints but empty summaries
--
-- This is a one-time migration to backfill historical data
-- ============================================

BEGIN;

-- Update all clients with their current touchpoint summary
UPDATE clients c
SET
  touchpoint_summary = COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'touchpoint_number', t.touchpoint_number,
          'type', t.type,
          'date', t.date,
          'rejection_reason', COALESCE(t.rejection_reason, ''),
          'status', COALESCE(t.status, ''),
          'user_id', t.user_id,
          'visit_id', t.visit_id,
          'call_id', t.call_id,
          'created_at', t.created_at,
          'updated_at', t.updated_at,
          'is_legacy', t.is_legacy
        ) ORDER BY t.touchpoint_number
      )
      FROM touchpoints t
      WHERE t.client_id = c.id
    ),
    '[]'::jsonb
  ),
  touchpoint_number = COALESCE(
    (
      SELECT COUNT(*)
      FROM touchpoints
      WHERE client_id = c.id
    ),
    0
  ),
  next_touchpoint = CASE
    WHEN COALESCE(
      (
        SELECT COUNT(*)
        FROM touchpoints
        WHERE client_id = c.id
      ),
      0
    ) >= 7 THEN NULL
    ELSE (
      CASE (
        SELECT COALESCE(COUNT(*), 0) + 1
        FROM touchpoints
        WHERE client_id = c.id
      )
        WHEN 1 THEN 'Visit'::text
        WHEN 2 THEN 'Call'::text
        WHEN 3 THEN 'Call'::text
        WHEN 4 THEN 'Visit'::text
        WHEN 5 THEN 'Call'::text
        WHEN 6 THEN 'Call'::text
        WHEN 7 THEN 'Visit'::text
        ELSE 'Visit'::text
      END
    )
  END,
  updated_at = NOW()
WHERE c.deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON TABLE clients IS 'Touchpoint summary columns (touchpoint_summary, touchpoint_number, next_touchpoint) are automatically updated by triggers when touchpoints are created, updated, or deleted';

COMMIT;
