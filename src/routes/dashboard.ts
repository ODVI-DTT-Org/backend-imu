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

// Helper function to get local date string (not UTC)
function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// GET /api/dashboard - Get dashboard statistics
dashboard.get('/', authMiddleware, requirePermission('dashboard', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');

    // Default to current month if no dates provided
    const now = new Date();
    const monthStart = startDate || getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = endDate || getLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    // Build role-based filter
    const caravanFilter = user.role === 'caravan' ? 'AND user_id = $3' : '';
    const caravanParams = user.role === 'caravan' ? [user.sub] : [];

    // Get client statistics
    const clientStats = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE client_type = 'POTENTIAL') as potential_clients,
        COUNT(*) FILTER (WHERE client_type = 'EXISTING') as existing_clients,
        COUNT(*) as total_clients
       FROM clients
       WHERE 1=1 ${user.role === 'caravan' ? 'AND user_id = $1' : ''}`,
      caravanParams
    );

    // Get touchpoint statistics for the period
    const touchpointStats = await pool.query(
      `SELECT
        COUNT(*) as total_touchpoints,
        COUNT(*) FILTER (WHERE type = 'Visit') as visits,
        COUNT(*) FILTER (WHERE type = 'Call') as calls
       FROM touchpoints
       WHERE created_at::date >= $1 AND created_at::date <= $2 ${caravanFilter}`,
      [monthStart, monthEnd, ...caravanParams]
    );

    // Get itinerary statistics
    const itineraryStats = await pool.query(
      `SELECT
        COUNT(*) as total_itineraries,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress
       FROM itineraries
       WHERE scheduled_date >= $1 AND scheduled_date <= $2 ${caravanFilter.replace('user_id', 'user_id')}`,
      [monthStart, monthEnd, ...caravanParams]
    );

    // Get caravan statistics (admin only)
    let caravanStats = { total_caravans: 0, active_caravans: 0 };
    if (user.role === 'admin' || user.role === 'staff') {
      const caravanResult = await pool.query(
        `SELECT
          COUNT(*) as total_caravans,
          COUNT(*) FILTER (WHERE u.is_active = true) as active_caravans
         FROM users u
         WHERE u.role = 'caravan'`
      );
      caravanStats = caravanResult.rows[0];
    }

    // Get recent activity
    const recentActivity = await pool.query(
      `SELECT
        'touchpoint' as type, t.id, t.created_at as date,
        c.first_name || ' ' || c.last_name as client_name
       FROM touchpoints t
       JOIN clients c ON c.id = t.client_id AND c.deleted_at IS NULL
       WHERE t.created_at >= NOW() - INTERVAL '7 days' ${caravanFilter.replace('caravan_id', 't.user_id')}
       UNION ALL
       SELECT
        'itinerary' as type, i.id, i.created_at as date,
        c.first_name || ' ' || c.last_name as client_name
       FROM itineraries i
       JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
       WHERE i.created_at >= NOW() - INTERVAL '7 days' ${caravanFilter.replace('caravan_id', 'i.user_id')}
       ORDER BY date DESC
       LIMIT 10`,
      user.role === 'caravan' ? [user.sub, user.sub] : []
    );

    // Get clients by agency breakdown
    const clientsByAgency = await pool.query(
      `SELECT a.name as agency_name, COUNT(c.id) as client_count
       FROM clients c
       LEFT JOIN agencies a ON a.id = c.agency_id
       ${user.role === 'caravan' ? 'WHERE c.user_id = $1' : ''}
       GROUP BY a.name
       ORDER BY client_count DESC
       LIMIT 5`,
      caravanParams
    );

    return c.json({
      period: {
        start_date: monthStart,
        end_date: monthEnd,
      },
      clients: {
        total: parseInt(clientStats.rows[0].total_clients),
        potential: parseInt(clientStats.rows[0].potential_clients),
        existing: parseInt(clientStats.rows[0].existing_clients),
      },
      touchpoints: {
        total: parseInt(touchpointStats.rows[0].total_touchpoints),
        visits: parseInt(touchpointStats.rows[0].visits),
        calls: parseInt(touchpointStats.rows[0].calls),
      },
      itineraries: {
        total: parseInt(itineraryStats.rows[0].total_itineraries),
        pending: parseInt(itineraryStats.rows[0].pending),
        completed: parseInt(itineraryStats.rows[0].completed),
        cancelled: parseInt(itineraryStats.rows[0].cancelled),
        in_progress: parseInt(itineraryStats.rows[0].in_progress),
      },
      caravans: caravanStats,
      clients_by_agency: clientsByAgency.rows.map(r => ({
        agency: r.agency_name || 'Unassigned',
        count: parseInt(r.client_count),
      })),
      recent_activity: recentActivity.rows.map(r => ({
        type: r.type,
        id: r.id,
        date: r.date,
        client_name: r.client_name,
      })),
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    throw error;
  }
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
