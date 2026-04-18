import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
} from '../errors/index.js';
import {
  getTargetProgress,
  getTeamPerformance,
  getActionItems,
  refreshActionItems,
  getActionItemsLastRefresh,
} from './dashboard-endpoints.js';
import { kpiCalculatorService } from '../services/kpi-calculator.js';

const dashboard = new Hono();

async function getManagerGroupMemberIds(userId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT gm.client_id as user_id
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.id
     WHERE g.area_manager_id = $1 OR g.assistant_area_manager_id = $1`,
    [userId]
  );
  return result.rows.map((r: any) => r.user_id);
}

// Helper function to get local date string (not UTC)
function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// GET /api/dashboard - Get dashboard summary + leaderboards
// Data lives in `visits` and `calls` tables (not `touchpoints`), filtered by created_at::date
dashboard.get('/', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const start = startDate || fmt(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = endDate || fmt(now);

    const isCaravan = user.role === 'caravan';
    const isManager = ['area_manager', 'assistant_area_manager'].includes(user.role);

    let managerMemberIds: string[] = [];
    let groupName: string | null = null;
    if (isManager) {
      managerMemberIds = await getManagerGroupMemberIds(user.sub);
      const groupNameResult = await pool.query(
        `SELECT g.name FROM groups g WHERE g.area_manager_id = $1 OR g.assistant_area_manager_id = $1 LIMIT 1`,
        [user.sub]
      );
      groupName = groupNameResult.rows[0]?.name ?? null;
    }

    if (isCaravan) {
      const [visitResult, callResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) as visits FROM visits
           WHERE user_id = $1 AND created_at::date >= $2 AND created_at::date <= $3`,
          [user.sub, start, end]
        ),
        pool.query(
          `SELECT COUNT(*) as calls FROM calls
           WHERE user_id = $1 AND created_at::date >= $2 AND created_at::date <= $3`,
          [user.sub, start, end]
        ),
      ]);
      const visits = parseInt(visitResult.rows[0].visits);
      const calls = parseInt(callResult.rows[0].calls);
      return c.json({
        period: { start_date: start, end_date: end },
        summary: { total_touchpoints: visits + calls, visits, calls },
        top_caravans: [],
        top_teles: [],
        top_groups: [],
      });
    }

    const memberFilter = isManager && managerMemberIds.length > 0
      ? `AND user_id = ANY($3::uuid[])`
      : '';
    const memberParams = isManager && managerMemberIds.length > 0
      ? [managerMemberIds]
      : [];

    const [summaryResult, caravanResult, teleResult, groupResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE src = 'visit') as visits,
           COUNT(*) FILTER (WHERE src = 'call') as calls
         FROM (
           SELECT 'visit' as src, user_id FROM visits WHERE created_at::date >= $1 AND created_at::date <= $2
           UNION ALL
           SELECT 'call' as src, user_id FROM calls WHERE created_at::date >= $1 AND created_at::date <= $2
         ) tp
         WHERE true ${memberFilter}`,
        [start, end, ...memberParams]
      ),
      pool.query(
        `SELECT u.id as user_id, u.first_name || ' ' || u.last_name as name,
                COUNT(v.id) as visits
         FROM visits v
         JOIN users u ON u.id = v.user_id
         WHERE v.created_at::date >= $1 AND v.created_at::date <= $2
         GROUP BY u.id, u.first_name, u.last_name
         ORDER BY visits DESC
         LIMIT 3`,
        [start, end]
      ),
      pool.query(
        `SELECT u.id as user_id, u.first_name || ' ' || u.last_name as name,
                COUNT(c.id) as calls
         FROM calls c
         JOIN users u ON u.id = c.user_id
         WHERE c.created_at::date >= $1 AND c.created_at::date <= $2
         GROUP BY u.id, u.first_name, u.last_name
         ORDER BY calls DESC
         LIMIT 3`,
        [start, end]
      ),
      // group_members.client_id references users.id (the agent assigned to the group)
      pool.query(
        `SELECT g.id as group_id, g.name,
                uc.first_name || ' ' || uc.last_name as caravan_name,
                COALESCE(v_agg.visits, 0) + COALESCE(c_agg.calls, 0) as total_touchpoints
         FROM groups g
         LEFT JOIN users uc ON uc.id = g.caravan_id
         LEFT JOIN (
           SELECT gm.group_id, COUNT(v.id) as visits
           FROM group_members gm
           JOIN visits v ON v.user_id = gm.client_id
           WHERE v.created_at::date >= $1 AND v.created_at::date <= $2
           GROUP BY gm.group_id
         ) v_agg ON v_agg.group_id = g.id
         LEFT JOIN (
           SELECT gm.group_id, COUNT(c.id) as calls
           FROM group_members gm
           JOIN calls c ON c.user_id = gm.client_id
           WHERE c.created_at::date >= $1 AND c.created_at::date <= $2
           GROUP BY gm.group_id
         ) c_agg ON c_agg.group_id = g.id
         ORDER BY total_touchpoints DESC
         LIMIT 3`,
        [start, end]
      ),
    ]);

    const sr = summaryResult.rows[0];
    return c.json({
      period: { start_date: start, end_date: end },
      summary: {
        total_touchpoints: parseInt(sr.total),
        visits: parseInt(sr.visits),
        calls: parseInt(sr.calls),
      },
      top_caravans: caravanResult.rows.map((r: any) => ({
        user_id: r.user_id,
        name: r.name,
        visits: parseInt(r.visits),
      })),
      top_teles: teleResult.rows.map((r: any) => ({
        user_id: r.user_id,
        name: r.name,
        calls: parseInt(r.calls),
      })),
      top_groups: groupResult.rows.map((r: any) => ({
        group_id: r.group_id,
        name: r.name,
        caravan_name: r.caravan_name || null,
        total_touchpoints: parseInt(r.total_touchpoints),
      })),
      ...(groupName ? { group_name: groupName } : {}),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Dashboard error:', error);
    return c.json({ error: msg, message: msg }, 500);
  }
});

// GET /api/dashboard/debug - Test each query individually (temporary)
dashboard.get('/debug', authMiddleware, async (c) => {
  const today = new Date();
  const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const results: Record<string, string> = {};

  const queries: [string, string, any[]][] = [
    ['touchpoints_summary', `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE tp.type = 'Visit') as visits, COUNT(*) FILTER (WHERE tp.type = 'Call') as calls FROM touchpoints tp WHERE tp.date >= $1 AND tp.date <= $2`, [start, end]],
    ['caravan_leaderboard', `SELECT u.id as user_id FROM touchpoints t JOIN users u ON u.id = t.user_id WHERE u.role = 'caravan' AND t.type = 'Visit' AND t.date >= $1 AND t.date <= $2 GROUP BY u.id LIMIT 3`, [start, end]],
    ['tele_leaderboard', `SELECT u.id as user_id FROM touchpoints t JOIN users u ON u.id = t.user_id WHERE u.role = 'tele' AND t.type = 'Call' AND t.date >= $1 AND t.date <= $2 GROUP BY u.id LIMIT 3`, [start, end]],
    ['group_leaderboard', `SELECT g.id as group_id FROM groups g JOIN group_members gm ON gm.group_id = g.id JOIN touchpoints t ON t.client_id = gm.client_id LEFT JOIN users u ON u.id = g.caravan_id WHERE t.date >= $1 AND t.date <= $2 GROUP BY g.id LIMIT 3`, [start, end]],
  ];

  for (const [name, sql, params] of queries) {
    try {
      await pool.query(sql, params);
      results[name] = 'OK';
    } catch (e: any) {
      results[name] = e.message;
    }
  }

  return c.json({ start, end, results });
});

// GET /api/dashboard/performance - Get performance metrics
dashboard.get('/performance', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const caravanId = c.req.query('caravan_id') || (user.role === 'caravan' ? user.sub : null);

    if (!caravanId) {
      throw new ValidationError('Caravan ID required');
    }

    // Get daily touchpoints for last 30 days
    const dailyTouchpoints = await pool.query(
      `SELECT date, COUNT(*) as count
       FROM touchpoints
       WHERE user_id = $1
         AND date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY date
       ORDER BY date DESC`,
      [caravanId]
    );

    // Get touchpoint type breakdown
    const touchpointTypes = await pool.query(
      `SELECT type, COUNT(*) as count
       FROM touchpoints
       WHERE user_id = $1
         AND date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY type`,
      [caravanId]
    );

    // Get client conversion rate
    const conversionStats = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE client_type = 'POTENTIAL') as potential,
        COUNT(*) FILTER (WHERE client_type = 'EXISTING') as existing
       FROM clients
       WHERE user_id = $1`,
      [caravanId]
    );

    return c.json({
      daily_touchpoints: dailyTouchpoints.rows.map(r => ({
        date: r.date,
        count: parseInt(r.count),
      })),
      touchpoint_types: touchpointTypes.rows.map(r => ({
        type: r.type,
        count: parseInt(r.count),
      })),
      conversion: {
        potential: parseInt(conversionStats.rows[0].potential),
        existing: parseInt(conversionStats.rows[0].existing),
      },
    });
  } catch (error) {
    console.error('Performance stats error:', error);
    throw new Error();
  }
});

// ============================================
// Target Progress Endpoint
// ============================================

const targetProgressQuerySchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  user_id: z.string().uuid().optional(),
});

/**
 * GET /api/dashboard/target-progress
 * Get target progress for current user or specified user
 * Performance target: < 100ms
 */
dashboard.get('/target-progress', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const query = targetProgressQuerySchema.parse(c.req.query());

    // Only admins can view other users' progress
    const userId = query.user_id || user.sub;

    const result = await getTargetProgress({
      userId,
      dateFrom: query.date_from,
      dateTo: query.date_to,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid query parameters');
    }
    console.error('Get target progress error:', error);
    throw new Error('Failed to get target progress');
  }
});

// ============================================
// Team Performance Endpoint
// ============================================

const teamPerformanceQuerySchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  role_filter: z.enum(['all', 'caravan', 'tele']).optional(),
});

/**
 * GET /api/dashboard/team-performance
 * Get team performance with role-based filtering
 * Performance target: < 200ms
 */
dashboard.get('/team-performance', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const query = teamPerformanceQuerySchema.parse(c.req.query());

    // Determine role for filtering
    let role = user.role;
    if (query.role_filter && query.role_filter !== 'all') {
      role = query.role_filter;
    }

    const result = await getTeamPerformance({
      dateFrom: query.date_from,
      dateTo: query.date_to,
      role,
      userId: user.sub,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid query parameters');
    }
    console.error('Get team performance error:', error);
    throw new Error('Failed to get team performance');
  }
});

// ============================================
// Action Items Endpoint
// ============================================

const actionItemsQuerySchema = z.object({
  priority: z.enum(['high', 'medium', 'low']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * GET /api/dashboard/action-items
 * Get action items from materialized view
 * Performance: < 50ms (uses pre-computed view)
 */
dashboard.get('/action-items', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const query = actionItemsQuerySchema.parse(c.req.query());

    // Non-admins only see their own action items
    const userId = user.role === 'admin' ? undefined : user.sub;

    const result = await getActionItems({
      userId,
      priority: query.priority,
      limit: query.limit || 20,
    });

    return c.json({
      success: true,
      data: result,
      lastRefresh: await getActionItemsLastRefresh(),
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid query parameters');
    }
    console.error('Get action items error:', error);
    throw new Error('Failed to get action items');
  }
});

// ============================================
// Action Items Refresh Endpoint (Admin Only)
// ============================================

/**
 * POST /api/dashboard/action-items/refresh
 * Refresh action items materialized view (admin only)
 */
dashboard.post('/action-items/refresh', authMiddleware, requirePermission('dashboard', 'configure'), auditMiddleware('dashboard', 'refresh'), async (c) => {
  try {
    await refreshActionItems();

    return c.json({
      success: true,
      message: 'Action items refreshed successfully',
      lastRefresh: await getActionItemsLastRefresh(),
    });
  } catch (error) {
    console.error('Refresh action items error:', error);
    throw new Error('Failed to refresh action items');
  }
});

// ============================================
// Dashboard Summary Endpoint (Combined)
// ============================================

/**
 * GET /api/dashboard/summary
 * Get combined dashboard summary for current user
 * Performance target: < 300ms (aggregates all three)
 */
dashboard.get('/summary', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');

    // Get current month date range
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const dateFrom = firstDay.toISOString().split('T')[0];
    const dateTo = lastDay.toISOString().split('T')[0];

    // Fetch all dashboard data in parallel
    const [targetProgress, actionItems] = await Promise.all([
      getTargetProgress({
        userId: user.sub,
        dateFrom,
        dateTo,
      }),
      getActionItems({
        userId: user.role === 'admin' ? undefined : user.sub,
        limit: 10,
      }),
    ]);

    // Get team performance only for admins/managers
    let teamPerformance = [];
    if (user.role === 'admin' || user.role === 'area_manager' || user.role === 'assistant_area_manager') {
      teamPerformance = await getTeamPerformance({
        dateFrom,
        dateTo,
        role: user.role,
        userId: user.sub,
      });
    }

    return c.json({
      success: true,
      data: {
        targetProgress,
        actionItems,
        teamPerformance,
        summary: {
          totalActionItems: actionItems.length,
          highPriorityItems: actionItems.filter((item: any) => item.priority === 'high').length,
          teamSize: teamPerformance.length,
        },
      },
    });
  } catch (error) {
    console.error('Get dashboard summary error:', error);
    throw new Error('Failed to get dashboard summary');
  }
});

// ============================================
// Dashboard Stats Endpoint (Frontend Compatible)
// ============================================

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics in format expected by frontend
 * Performance target: < 100ms
 */
dashboard.get('/stats', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');

    // Get total clients
    const totalClientsResult = await pool.query(
      'SELECT COUNT(*) as count FROM clients WHERE deleted_at IS NULL'
    );
    const totalClients = parseInt(totalClientsResult.rows[0].count);

    // Get touchpoint statistics
    const touchpointStatsResult = await pool.query(
      `SELECT
         COUNT(*) as total_touchpoints,
         COUNT(*) FILTER (WHERE status = 'Completed') as completed_touchpoints
       FROM touchpoints`
    );
    const totalTouchpoints = parseInt(touchpointStatsResult.rows[0].total_touchpoints);
    const completedTouchpoints = parseInt(touchpointStatsResult.rows[0].completed_touchpoints);

    // Calculate conversion rate (potential → existing)
    const conversionResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE client_type = 'POTENTIAL') as potential,
         COUNT(*) FILTER (WHERE client_type = 'EXISTING') as existing
       FROM clients
       WHERE deleted_at IS NULL`
    );
    const potential = parseInt(conversionResult.rows[0].potential) || 0;
    const existing = parseInt(conversionResult.rows[0].existing) || 0;
    const conversionRate = potential > 0 ? Math.round((existing / potential) * 100) : 0;

    // Get active caravans (check if is_active column exists first)
    let activeCaravans = 0;
    try {
      const activeCaravansResult = await pool.query(
        `SELECT COUNT(*) as count
         FROM users
         WHERE role = 'caravan' AND (is_active IS NULL OR is_active = true)`
      );
      activeCaravans = parseInt(activeCaravansResult.rows[0].count);
    } catch (error) {
      // Fallback if is_active column doesn't exist
      const activeCaravansResult = await pool.query(
        `SELECT COUNT(*) as count
         FROM users
         WHERE role = 'caravan'`
      );
      activeCaravans = parseInt(activeCaravansResult.rows[0].count);
    }

    // Get total agents (caravans + teles) with backwards compatibility
    let totalAgents = 0;
    try {
      const totalAgentsResult = await pool.query(
        `SELECT COUNT(*) as count
         FROM users
         WHERE role IN ('caravan', 'tele') AND (is_active IS NULL OR is_active = true)`
      );
      totalAgents = parseInt(totalAgentsResult.rows[0].count);
    } catch (error) {
      // Fallback if is_active column doesn't exist
      const totalAgentsResult = await pool.query(
        `SELECT COUNT(*) as count
         FROM users
         WHERE role IN ('caravan', 'tele')`
      );
      totalAgents = parseInt(totalAgentsResult.rows[0].count);
    }

    // Get today's visits
    const todayVisitsResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM itineraries
       WHERE scheduled_date = CURRENT_DATE
         AND status IN ('pending', 'in_progress')`
    );
    const todayVisits = parseInt(todayVisitsResult.rows[0].count);

    return c.json({
      success: true,
      data: {
        totalClients,
        totalTouchpoints,
        completedTouchpoints,
        conversionRate,
        activeCaravans,
        totalAgents,
        todayVisits,
      },
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    throw new Error('Failed to get dashboard stats');
  }
});

// ============================================
// Recent Activities Endpoint
// ============================================

/**
 * GET /api/dashboard/recent-activities
 * Get recent activities for the dashboard
 * Performance target: < 100ms
 */
dashboard.get('/recent-activities', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit') || '10');

    // Get recent activities from multiple sources
    const recentActivitiesResult = await pool.query(
      `
      SELECT
        id,
        type,
        description,
        created_at as timestamp,
        user_id,
        user_name
      FROM (
        -- Touchpoint activities
        SELECT
          t.id,
          'touchpoint_created' as type,
          'Touchpoint created for ' || COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') as description,
          t.created_at,
          t.user_id,
          u.first_name || ' ' || u.last_name as user_name
        FROM touchpoints t
        LEFT JOIN clients c ON c.id = t.client_id AND c.deleted_at IS NULL
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.created_at >= NOW() - INTERVAL '7 days'

        UNION ALL

        -- Client activities
        SELECT
          c.id,
          CASE
            WHEN c.client_type = 'POTENTIAL' THEN 'client_created_potential'
            ELSE 'client_created_existing'
          END as type,
          'New ' || LOWER(c.client_type) || ' client: ' || COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') as description,
          c.created_at,
          c.user_id,
          u.first_name || ' ' || u.last_name as user_name
        FROM clients c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.created_at >= NOW() - INTERVAL '7 days' AND c.deleted_at IS NULL

        UNION ALL

        -- Itinerary activities
        SELECT
          i.id,
          CASE
            WHEN i.status = 'completed' THEN 'itinerary_completed'
            WHEN i.status = 'cancelled' THEN 'itinerary_cancelled'
            ELSE 'itinerary_scheduled'
          END as type,
          CASE
            WHEN i.status = 'completed' THEN 'Visit completed for ' || COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')
            WHEN i.status = 'cancelled' THEN 'Visit cancelled for ' || COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')
            ELSE 'Visit scheduled for ' || COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')
          END as description,
          i.created_at,
          i.user_id,
          u.first_name || ' ' || u.last_name as user_name
        FROM itineraries i
        LEFT JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
        LEFT JOIN users u ON u.id = i.user_id
        WHERE i.created_at >= NOW() - INTERVAL '7 days' AND i.deleted_at IS NULL
      ) activities
      ORDER BY timestamp DESC
      LIMIT $1
      `,
      [limit]
    );

    const recentActivities = recentActivitiesResult.rows.map(row => ({
      id: row.id,
      type: row.type,
      description: row.description,
      timestamp: row.timestamp,
      user: row.user_id ? {
        id: row.user_id,
        name: row.user_name,
      } : null,
    }));

    return c.json({
      success: true,
      data: recentActivities,
    });
  } catch (error) {
    console.error('Get recent activities error:', error);
    throw new Error('Failed to get recent activities');
  }
});

// ============================================
// Analytics Endpoint
// ============================================

const analyticsQuerySchema = z.object({
  period: z.enum(['today', 'week', 'month', 'quarter']).default('month'),
});

/**
 * GET /api/dashboard/analytics
 * Get analytics data with trends and performance metrics
 * Performance target: < 200ms
 */
dashboard.get('/analytics', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const query = analyticsQuerySchema.parse(c.req.query());

    // Determine date range based on period
    const now = new Date();
    let startDate: Date;
    const endDate = now;

    switch (query.period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get daily trends for the period
    const trendsResult = await pool.query(
      `
      SELECT
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE type = 'Visit') as visits,
        COUNT(*) FILTER (WHERE type = 'Call') as calls
      FROM touchpoints
      WHERE date >= $1 AND date <= $2
      GROUP BY DATE(created_at)
      ORDER BY date
      `,
      [startDateStr, endDateStr]
    );

    const trends = trendsResult.rows.map(row => ({
      date: row.date,
      visits: parseInt(row.visits),
      calls: parseInt(row.calls),
    }));

    // Get caravan performance (for admins/managers)
    let caravanPerformance: Array<{
      id: string;
      name: string;
      role: string;
      visits: number;
      calls: number;
      totalTouchpoints: number;
    }> = [];
    if (user.role === 'admin' || user.role === 'area_manager' || user.role === 'assistant_area_manager') {
      const caravanPerfResult = await pool.query(
        `
        SELECT
          u.id,
          u.first_name || ' ' || u.last_name as name,
          u.role,
          COUNT(t.id) FILTER (WHERE t.type = 'Visit' AND t.date >= $1 AND t.date <= $2) as visits,
          COUNT(t.id) FILTER (WHERE t.type = 'Call' AND t.date >= $1 AND t.date <= $2) as calls,
          COUNT(t.id) FILTER (WHERE t.date >= $1 AND t.date <= $2) as total_touchpoints
        FROM users u
        LEFT JOIN touchpoints t ON t.user_id = u.id
        WHERE u.role IN ('caravan', 'tele') AND u.is_active = true
        GROUP BY u.id, u.first_name, u.last_name, u.role
        ORDER BY total_touchpoints DESC
        LIMIT 10
        `,
        [startDateStr, endDateStr]
      );

      caravanPerformance = caravanPerfResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        role: row.role,
        visits: parseInt(row.visits),
        calls: parseInt(row.calls),
        totalTouchpoints: parseInt(row.total_touchpoints),
      }));
    }

    // Get conversion rate trends
    const conversionRateResult = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE client_type = 'POTENTIAL') as potential,
        COUNT(*) FILTER (WHERE client_type = 'EXISTING') as existing,
        CASE
          WHEN COUNT(*) FILTER (WHERE client_type = 'POTENTIAL') > 0
          THEN ROUND((COUNT(*) FILTER (WHERE client_type = 'EXISTING')::numeric / COUNT(*) FILTER (WHERE client_type = 'POTENTIAL')::numeric) * 100)
          ELSE 0
        END as conversion_rate
      FROM clients
      WHERE created_at >= $1 AND created_at <= $2 AND deleted_at IS NULL
      `,
      [startDateStr, endDateStr]
    );

    const conversionRate = {
      potential: parseInt(conversionRateResult.rows[0].potential),
      existing: parseInt(conversionRateResult.rows[0].existing),
      rate: parseInt(conversionRateResult.rows[0].conversion_rate),
    };

    // Calculate average response time (time from client creation to first touchpoint)
    const avgResponseTimeResult = await pool.query(
      `
      SELECT
        AVG(EXTRACT(EPOCH FROM (t.created_at - c.created_at)) / 3600) as avg_hours
      FROM clients c
      LEFT JOIN touchpoints t ON t.client_id = c.id AND t.touchpoint_number = 1
      WHERE c.created_at >= $1 AND c.created_at <= $2
        AND c.deleted_at IS NULL
        AND t.id IS NOT NULL
      `,
      [startDateStr, endDateStr]
    );

    const averageResponseTime = avgResponseTimeResult.rows[0].avg_hours
      ? Math.round(parseFloat(avgResponseTimeResult.rows[0].avg_hours) * 10) / 10
      : 0;

    // Build summary
    const summary = {
      period: query.period,
      dateRange: {
        start: startDateStr,
        end: endDateStr,
      },
      totalClients: parseInt((await pool.query('SELECT COUNT(*) as count FROM clients WHERE created_at >= $1 AND created_at <= $2 AND deleted_at IS NULL', [startDateStr, endDateStr])).rows[0].count),
      totalTouchpoints: parseInt((await pool.query('SELECT COUNT(*) as count FROM touchpoints WHERE date >= $1 AND date <= $2', [startDateStr, endDateStr])).rows[0].count),
      conversionRate: conversionRate.rate,
      averageResponseTime,
    };

    return c.json({
      success: true,
      data: {
        trends,
        caravanPerformance,
        conversionRate,
        averageResponseTime,
        summary,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid query parameters');
    }
    console.error('Get analytics error:', error);
    throw new Error('Failed to get analytics');
  }
});

// ============================================
// Executive Dashboard KPI Endpoint
// ============================================

const kpiQuerySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * GET /api/dashboard/kpi
 * Get KPIs for Executive Dashboard with traffic light indicators
 * Performance target: < 200ms
 */
dashboard.get('/kpi', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const query = kpiQuerySchema.parse(c.req.query());

    // Calculate all KPIs
    const kpis = await kpiCalculatorService.calculateAllKPIs(
      query.start_date,
      query.end_date
    );

    return c.json({
      success: true,
      data: kpis,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid query parameters');
    }
    console.error('Get KPIs error:', error);
    throw new Error('Failed to get KPIs');
  }
});

export default dashboard;
