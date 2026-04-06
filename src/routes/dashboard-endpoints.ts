/**
 * Dashboard API Endpoints
 *
 * Optimized endpoints for dashboard with CTE-based queries
 * Target: < 100ms for target progress, < 200ms for team performance
 *
 * @file dashboard-endpoints.ts
 */

import { pool } from '../db/index.js';

/**
 * Get target progress for a user
 * Uses CTE for optimized query performance (< 100ms target)
 */
export async function getTargetProgress(params: {
  userId: string;
  dateFrom: string;
  dateTo: string;
}) {
  const { userId, dateFrom, dateTo } = params;

  const query = `
    WITH targets AS (
      SELECT
        COALESCE(SUM(target_clients), 0) as clientsTarget,
        COALESCE(SUM(target_touchpoints), 0) as touchpointsTarget,
        COALESCE(SUM(target_visits), 0) as visitsTarget
      FROM targets
      WHERE user_id = $1
        AND period = 'monthly'
        AND year = EXTRACT(YEAR FROM $3::date)
        AND month = EXTRACT(MONTH FROM $3::date)
    ),
    actuals AS (
      SELECT
        COUNT(DISTINCT CASE WHEN c.client_type = 'EXISTING' THEN c.id END) as clientsActual,
        COUNT(t.id) as touchpointsActual,
        COUNT(t.id) FILTER (WHERE t.type = 'Visit') as visitsActual
      FROM clients c
      LEFT JOIN touchpoints t ON t.client_id = c.id
        AND t.date >= $2::date
        AND t.date <= $3::date
      WHERE (c.user_id = $1 OR c.user_id IS NULL) AND c.deleted_at IS NULL
    )
    SELECT
      t.*,
      a.*,
      CASE
        WHEN t.clientsTarget > 0 THEN ROUND((a.clientsActual::numeric / t.clientsTarget) * 100, 1)
        ELSE 0
      END as clientsProgress,
      CASE
        WHEN t.touchpointsTarget > 0 THEN ROUND((a.touchpointsActual::numeric / t.touchpointsTarget) * 100, 1)
        ELSE 0
      END as touchpointsProgress,
      CASE
        WHEN t.visitsTarget > 0 THEN ROUND((a.visitsActual::numeric / t.visitsTarget) * 100, 1)
        ELSE 0
      END as visitsProgress
    FROM targets t, actuals a
  `;

  const result = await pool.query(query, [userId, dateFrom, dateTo]);
  const row = result.rows[0];

  // Handle case when no data exists (no targets set)
  if (!row) {
    return {
      targets: {
        clientsTarget: 0,
        touchpointsTarget: 0,
        visitsTarget: 0,
      },
      actuals: {
        clientsActual: 0,
        touchpointsActual: 0,
        visitsActual: 0,
      },
      progress: {
        clientsProgress: 0,
        touchpointsProgress: 0,
        visitsProgress: 0,
      },
    };
  }

  // Return nested structure for better API response
  return {
    targets: {
      clientsTarget: row.clientstarget || 0,
      touchpointsTarget: row.touchpointstarget || 0,
      visitsTarget: row.visitstarget || 0,
    },
    actuals: {
      clientsActual: row.clientsactual || 0,
      touchpointsActual: row.touchpointsactual || 0,
      visitsActual: row.visitsactual || 0,
    },
    progress: {
      clientsProgress: row.clientsprogress || 0,
      touchpointsProgress: row.touchpointsprogress || 0,
      visitsProgress: row.visitsprogress || 0,
    },
  };
}

/**
 * Get team performance with role-based filtering
 * Uses CTE for optimized query performance (< 200ms target)
 */
export async function getTeamPerformance(params: {
  dateFrom: string;
  dateTo: string;
  role: string;
  userId: string;
}) {
  const { dateFrom, dateTo, role, userId } = params;

  // Touchpoint sequence for determining callable status
  const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];

  // Build WHERE clause based on user role
  let whereClause = '';
  if (role === 'admin') {
    whereClause = '1=1'; // Admin sees all
  } else if (role === 'area_manager' || role === 'assistant_area_manager') {
    whereClause = `u.area_manager_id = '${userId}' OR u.assistant_area_manager_id = '${userId}'`;
  } else if (role === 'caravan' || role === 'tele') {
    whereClause = `u.id = '${userId}'`; // Field agents see only themselves
  }

  const query = `
    WITH agent_stats AS (
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.role,
        u.status,
        COUNT(DISTINCT CASE WHEN c.client_type = 'EXISTING' THEN c.id END) as clientsCompleted,
        COUNT(t.id) as touchpointsCompleted,
        COALESCE(SUM(targ.target_clients), 0) as clientsTarget,
        COALESCE(SUM(targ.target_touchpoints), 0) as touchpointsTarget,
        COALESCE(SUM(targ.target_visits), 0) as visitsTarget
      FROM users u
      LEFT JOIN clients c ON c.user_id = u.id AND c.deleted_at IS NULL
      LEFT JOIN touchpoints t ON t.client_id = c.id
        AND t.date >= $1::date AND t.date <= $2::date
      LEFT JOIN targets targ ON targ.user_id = u.id
        AND targ.period = 'monthly'
        AND targ.year = EXTRACT(YEAR FROM $1::date)
        AND targ.month = EXTRACT(MONTH FROM $1::date)
      WHERE u.role IN ('caravan', 'tele')
        AND (${whereClause})
        AND u.status = 'active'
      GROUP BY u.id, u.first_name, u.last_name, u.role, u.status
    )
    SELECT * FROM agent_stats
    ORDER BY
      CASE
        WHEN touchpointsTarget > 0 THEN ROUND((touchpointsCompleted::numeric / touchpointsTarget) * 100, 1)
        ELSE 0
      END DESC
  `;

  const result = await pool.query(query, [dateFrom, dateTo]);
  return result.rows;
}

/**
 * Get action items from materialized view
 * Fast access using pre-computed materialized view
 */
export async function getActionItems(params: {
  userId?: string;
  priority?: string;
  limit?: number;
}) {
  const { userId, priority, limit = 50 } = params;

  const conditions: string[] = ['1=1'];
  const queryParams: any[] = [];

  if (userId) {
    conditions.push('assigned_to = $1');
    queryParams.push(userId);
  }

  if (priority) {
    conditions.push('priority = $2');
    queryParams.push(priority);
  }

  const query = `
    SELECT
      action_type,
      priority,
      client_id,
      first_name,
      last_name,
      municipality,
      scheduled_date,
      assigned_to,
      days_overdue
    FROM action_items
    WHERE ${conditions.join(' AND ')}
    ORDER BY priority DESC, days_overdue DESC
    LIMIT $${queryParams.length + 1}
  `;

  queryParams.push(limit);
  const result = await pool.query(query, queryParams);
  return result.rows;
}

/**
 * Refresh action items materialized view
 * Should be called periodically (every 5-15 minutes) via cron job
 */
export async function refreshActionItems() {
  const result = await pool.query('REFRESH MATERIALIZED VIEW action_items');
  return result;
}

/**
 * Get last refresh time for action items
 */
export async function getActionItemsLastRefresh() {
  const result = await pool.query(`
    SELECT schemaname, matviewname, last_refresh
    FROM pg_stat_user_operations
    WHERE actionname = 'REFRESH MATERIALIZED VIEW'
      AND objid = (SELECT oid FROM pg_class WHERE relname = 'action_items')
    ORDER BY last_refresh DESC
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].last_refresh;
}

// Export all dashboard endpoint functions
export const dashboardEndpoints = {
  getTargetProgress,
  getTeamPerformance,
  getActionItems,
  refreshActionItems,
  getActionItemsLastRefresh
};
