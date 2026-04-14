-- Migration 048: Create admin_clients_mv materialized view
-- Purpose: Optimize admin dashboard queries by pre-computing client statistics
-- Performance target: < 50ms for dashboard stats (currently 200-500ms)

-- Drop existing MV if it exists
DROP MATERIALIZED VIEW IF EXISTS admin_clients_mv CASCADE;

-- Create materialized view with unique index for CONCURRENTLY refresh
CREATE MATERIALIZED VIEW admin_clients_mv AS
SELECT
  -- Client identifiers
  c.id,
  c.client_type,
  c.product_type,
  c.market_type,
  c.pension_type,
  c.agency_id,
  c.user_id,
  c.created_at,
  c.updated_at,

  -- Client name (computed for filtering/searching)
  c.first_name,
  c.middle_name,
  c.last_name,

  -- Geographic info
  c.municipality_id,
  c.province,
  c.barangay,
  c.street_address,
  c.zip_code,

  -- Agency info
  a.name as agency_name,

  -- User/agent info
  u.first_name as agent_first_name,
  u.last_name as agent_last_name,
  u.role as agent_role,
  u.is_active as agent_is_active,

  -- Touchpoint summary (computed)
  COALESCE(tp.touchpoint_count, 0) as total_touchpoints,
  COALESCE(tp.visit_count, 0) as visit_count,
  COALESCE(tp.call_count, 0) as call_count,
  tp.completed_count,
  tp.last_touchpoint_date,
  tp.last_touchpoint_type,
  tp.next_touchpoint_number,

  -- Status flags (for quick filtering)
  CASE
    WHEN COALESCE(tp.touchpoint_count, 0) = 0 THEN true
    ELSE false
  END as is_new_client,

  CASE
    WHEN COALESCE(tp.completed_count, 0) >= 7 THEN true
    ELSE false
  END as is_completed,

  CASE
    WHEN tp.next_touchpoint_number IN (1, 4, 7) THEN 'Visit'
    WHEN tp.next_touchpoint_number IN (2, 3, 5, 6) THEN 'Call'
    ELSE NULL
  END as next_touchpoint_type,

  -- Data freshness timestamp
  NOW() as mv_updated_at

FROM clients c
LEFT JOIN agencies a ON a.id = c.agency_id
LEFT JOIN users u ON u.id = c.user_id
LEFT JOIN (
  -- Touchpoint summary subquery
  SELECT
    client_id,
    COUNT(*) as touchpoint_count,
    COUNT(*) FILTER (WHERE type = 'Visit') as visit_count,
    COUNT(*) FILTER (WHERE type = 'Call') as call_count,
    COUNT(*) FILTER (WHERE status = 'Completed') as completed_count,
    MAX(date) as last_touchpoint_date,
    MAX(type) FILTER (WHERE date = MAX(date) OVER (PARTITION BY client_id)) as last_touchpoint_type,
    COALESCE(MAX(touchpoint_number) FILTER (WHERE status != 'Completed'), 0) + 1 as next_touchpoint_number
  FROM touchpoints
  WHERE deleted_at IS NULL
  GROUP BY client_id
) tp ON tp.client_id = c.id
WHERE c.deleted_at IS NULL;

-- Create unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_admin_clients_mv_pkey ON admin_clients_mv (id);

-- Create indexes for common dashboard queries
CREATE INDEX idx_admin_clients_mv_client_type ON admin_clients_mv (client_type);
CREATE INDEX idx_admin_clients_mv_agency_id ON admin_clients_mv (agency_id);
CREATE INDEX idx_admin_clients_mv_user_id ON admin_clients_mv (user_id);
CREATE INDEX idx_admin_clients_mv_agent_role ON admin_clients_mv (agent_role);
CREATE INDEX idx_admin_clients_mv_province ON admin_clients_mv (province);
CREATE INDEX idx_admin_clients_mv_created_at ON admin_clients_mv (created_at DESC);
CREATE INDEX idx_admin_clients_mv_next_touchpoint ON admin_clients_mv (next_touchpoint_number, next_touchpoint_type);
CREATE INDEX idx_admin_clients_mv_is_new ON admin_clients_mv (is_new_client) WHERE is_new_client = true;
CREATE INDEX idx_admin_clients_mv_is_completed ON admin_clients_mv (is_completed) WHERE is_completed = true;

-- Comment the MV
COMMENT ON MATERIALIZED VIEW admin_clients_mv IS 'Admin dashboard client summary with touchpoint aggregates. Refreshed every 5 minutes.';

-- Grant permissions
GRANT SELECT ON admin_clients_mv TO admin_role;
GRANT SELECT ON admin_clients_mv TO staff_role;

-- Migration success
INSERT INTO schema_migrations (version, name, applied_at) VALUES (48, 'create_admin_clients_mv', NOW());
