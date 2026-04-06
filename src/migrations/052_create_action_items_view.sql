-- Migration: Create action_items materialized view
-- Date: 2026-04-06
-- Issue: Dashboard needs action items for overdue visits and follow-ups
-- Solution: Create materialized view with periodic refresh for performance

-- Drop existing view if it exists
DROP MATERIALIZED VIEW IF EXISTS action_items CASCADE;

-- Create materialized view for action items
CREATE MATERIALIZED VIEW action_items AS
WITH overdue_visits AS (
  -- Overdue visits (past scheduled date, not completed)
  SELECT
    'overdue_visit' as action_type,
    'high' as priority,
    c.id as client_id,
    c.first_name,
    c.last_name,
    c.municipality,
    i.scheduled_date,
    u.id as assigned_to,
    (CURRENT_DATE - i.scheduled_date)::INTEGER as days_overdue
  FROM itineraries i
  JOIN clients c ON i.client_id = c.id
  JOIN users u ON c.user_id = u.id
  WHERE i.scheduled_date < CURRENT_DATE
    AND i.status NOT IN ('completed', 'cancelled')
    AND c.user_id = u.id

  UNION ALL

  -- Overdue follow-ups (no touchpoint in 14+ days for interested clients)
  SELECT
    'overdue_followup' as action_type,
    'medium' as priority,
    c.id as client_id,
    c.first_name,
    c.last_name,
    c.municipality,
    MAX(t.date) as scheduled_date,
    c.user_id as assigned_to,
    (CURRENT_DATE - MAX(t.date))::INTEGER as days_overdue
  FROM clients c
  JOIN touchpoints t ON t.client_id = c.id
  WHERE c.loan_released = false
    AND EXISTS (
      SELECT 1 FROM touchpoints
      WHERE client_id = c.id
        AND status IN ('Interested', 'Undecided')
        AND date > CURRENT_DATE - INTERVAL '30 days'
    )
  GROUP BY c.id, c.first_name, c.last_name, c.municipality, c.user_id
  HAVING MAX(t.date) < CURRENT_DATE - INTERVAL '14 days'
)
SELECT * FROM overdue_visits
ORDER BY priority DESC, days_overdue DESC;

-- Create indexes on materialized view for fast queries
CREATE UNIQUE INDEX idx_action_items_client_type ON action_items(client_id, action_type);
CREATE INDEX idx_action_items_priority ON action_items(priority);
CREATE INDEX idx_action_items_assigned_to ON action_items(assigned_to);

COMMENT ON MATERIALIZED VIEW action_items IS 'Action items for dashboard: overdue visits and follow-ups that need attention';
COMMENT ON COLUMN action_items.action_type IS 'Type of action: overdue_visit or overdue_followup';
COMMENT ON COLUMN action_items.priority IS 'Priority level: high, medium, low';
COMMENT ON COLUMN action_items.days_overdue IS 'Number of days overdue (for sorting)';
