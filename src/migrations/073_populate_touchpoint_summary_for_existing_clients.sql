-- ============================================
-- Migration 073: Populate Touchpoint Summary for Existing Clients
-- ============================================
-- Purpose: One-time migration to populate touchpoint_summary,
-- touchpoint_number, and next_touchpoint for all existing clients
-- ============================================

-- Update all clients with their existing touchpoint data
UPDATE clients c
SET
  touchpoint_summary = COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'number', t.touchpoint_number,
        'type', t.type,
        'date', t.date,
        'reason', t.reason,
        'status', t.status,
        'user_id', t.user_id,
        'time_in', t.time_in,
        'time_out', t.time_out,
        'location', CASE
          WHEN t.time_in_gps_lat IS NOT NULL THEN
            jsonb_build_object(
              'latitude', t.time_in_gps_lat,
              'longitude', t.time_in_gps_lng,
              'address', t.time_in_gps_address
            )
          ELSE NULL
        END
      ) ORDER BY t.date
    ),
    '[]'::jsonb
  ),
  touchpoint_number = COALESCE(tp.count, 1),
  next_touchpoint = CASE
    WHEN COALESCE(tp.count, 0) >= 7 THEN NULL
    WHEN COALESCE(tp.count, 0) IN (0, 1, 4) THEN 'Visit'
    WHEN COALESCE(tp.count, 0) IN (2, 3, 5) THEN 'Call'
    ELSE 'Visit'
  END
FROM (
  SELECT client_id, COUNT(*) as count
  FROM touchpoints
  GROUP BY client_id
) tp
WHERE tp.client_id = c.id;

-- Verification query (run manually to check results)
-- Expected output: total_clients count, clients_with_touchpoints count
SELECT
  COUNT(*) as total_clients,
  COUNT(*) FILTER (WHERE jsonb_array_length(touchpoint_summary) > 0) as clients_with_touchpoints,
  AVG(jsonb_array_length(touchpoint_summary)) as avg_touchpoint_count
FROM clients
WHERE deleted_at IS NULL;
