import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/index.js';
import { getDashboardDateRange, getDashboardDateRangeForMonth, calcChangePct } from '../utils/dashboard-helpers.js';
import {
  ValidationError,
  AuthorizationError,
} from '../errors/index.js';
import { addReportJob, addLocationJob } from '../queues/utils/job-helpers.js';
import { ReportJobType, LocationJobType } from '../queues/jobs/job-types.js';
import {
  exportTouchpointsToExcel,
  exportClientsToExcel,
  exportAttendanceToExcel,
} from '../utils/excel-export.js';
import {
  exportToCsv,
  getDateRangeCondition,
  validateDateRange,
  getRecordCount,
  getReportExportConfig,
  getReportQuery,
} from '../utils/csv-export.js';

const reports = new Hono();

// Helper to get date range
function getDateRange(period: string): { startDate: Date; endDate: Date } {
  const now = new Date();
  const startDate = new Date();
  const endDate = new Date();

  switch (period) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'yesterday':
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'week':
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'month':
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'quarter':
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      startDate.setMonth(quarterMonth);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'year':
      startDate.setMonth(0);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      // Default to month
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate };
}

// GET /api/reports/dashboard?period=week|month|quarter|year
reports.get('/dashboard', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  // Optional month=YYYY-MM anchors the dashboard to a specific calendar month.
  // Falls back to the older period=week|month|quarter|year semantics when absent.
  const monthQuery = c.req.query('month')
  const rawPeriod = c.req.query('period') ?? 'month'
  const period = ['week', 'month', 'quarter', 'year'].includes(rawPeriod) ? rawPeriod : 'month'

  const range = monthQuery && /^\d{4}-\d{2}$/.test(monthQuery)
    ? getDashboardDateRangeForMonth(monthQuery)
    : getDashboardDateRange(period)
  const { from, to, prevFrom, prevTo } = range

  const fromStr     = from.toISOString().split('T')[0]
  const toStr       = to.toISOString().split('T')[0]
  const prevFromStr = prevFrom.toISOString().split('T')[0]
  const prevToStr   = prevTo.toISOString().split('T')[0]

  // Month view always buckets by day for the in-month trend chart.
  const truncFn = monthQuery
    ? 'day'
    : (period === 'quarter' ? 'week' : period === 'year' ? 'month' : 'day')

  const [releasesResult, touchpointsResult, funnelResult, timelineResult, agentsResult] =
    await Promise.all([
      pool.query<{
        releases_current: string
        releases_prev: string
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE created_at::date BETWEEN $1 AND $2
            AND status IN ('approved','released'))  AS releases_current,
          COUNT(*) FILTER (WHERE created_at::date BETWEEN $3 AND $4
            AND status IN ('approved','released'))  AS releases_prev
        FROM releases
      `, [fromStr, toStr, prevFromStr, prevToStr]),

      pool.query<{
        visits_current: string; visits_prev: string
        calls_current: string;  calls_prev: string
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE created_at::date BETWEEN $1 AND $2
            AND type = 'Visit')  AS visits_current,
          COUNT(*) FILTER (WHERE created_at::date BETWEEN $3 AND $4
            AND type = 'Visit')  AS visits_prev,
          COUNT(*) FILTER (WHERE created_at::date BETWEEN $1 AND $2
            AND type = 'Call')   AS calls_current,
          COUNT(*) FILTER (WHERE created_at::date BETWEEN $3 AND $4
            AND type = 'Call')   AS calls_prev
        FROM touchpoints
      `, [fromStr, toStr, prevFromStr, prevToStr]),

      pool.query<{ category: string; count: string }>(`
        WITH latest_release AS (
          SELECT DISTINCT ON (client_id)
            client_id, status, created_at
          FROM releases
          ORDER BY client_id, created_at DESC
        ),
        latest_visit AS (
          SELECT DISTINCT ON (client_id)
            client_id, created_at
          FROM visits
          ORDER BY client_id, created_at DESC
        ),
        categorized AS (
          SELECT
            c.id,
            CASE
              WHEN lr.status IN ('approved','released') THEN 'EXISTING'
              WHEN lv.client_id IS NOT NULL
                AND (NOW() - lv.created_at) <= INTERVAL '6 months' THEN 'FAVORABLE'
              WHEN lv.client_id IS NOT NULL THEN 'OTHERS'
              ELSE 'VIRGIN'
            END AS category
          FROM clients c
          LEFT JOIN latest_release lr ON lr.client_id = c.id
          LEFT JOIN latest_visit   lv ON lv.client_id = c.id
          WHERE c.deleted_at IS NULL
        )
        SELECT category, COUNT(*) AS count
        FROM categorized
        GROUP BY category
        ORDER BY CASE category
          WHEN 'VIRGIN' THEN 1 WHEN 'FAVORABLE' THEN 2
          WHEN 'OTHERS' THEN 3 WHEN 'EXISTING'  THEN 4
        END
      `),

      pool.query<{ bucket: string; count: string }>(`
        SELECT
          DATE_TRUNC('${truncFn}', created_at)::date AS bucket,
          COUNT(*) AS count
        FROM releases
        WHERE created_at::date BETWEEN $1 AND $2
          AND status IN ('approved','released')
        GROUP BY bucket
        ORDER BY bucket ASC
      `, [fromStr, toStr]),

      pool.query<{ agent_name: string; releases: string; visits: string }>(`
        SELECT
          u.first_name || ' ' || u.last_name AS agent_name,
          COUNT(DISTINCT r.id) AS releases,
          COUNT(DISTINCT v.id) AS visits
        FROM users u
        LEFT JOIN releases r ON r.user_id = u.id
          AND r.created_at::date BETWEEN $1 AND $2
          AND r.status IN ('approved','released')
        LEFT JOIN visits v ON v.user_id = u.id
          AND v.created_at::date BETWEEN $1 AND $2
        WHERE u.role = 'Caravan'
        GROUP BY u.id, u.first_name, u.last_name
        ORDER BY releases DESC, visits DESC
        LIMIT 5
      `, [fromStr, toStr]),
    ])

  const rCurr = parseInt(releasesResult.rows[0]?.releases_current ?? '0')
  const rPrev = parseInt(releasesResult.rows[0]?.releases_prev ?? '0')
  const vCurr = parseInt(touchpointsResult.rows[0]?.visits_current ?? '0')
  const vPrev = parseInt(touchpointsResult.rows[0]?.visits_prev ?? '0')
  const cCurr = parseInt(touchpointsResult.rows[0]?.calls_current ?? '0')
  const cPrev = parseInt(touchpointsResult.rows[0]?.calls_prev ?? '0')

  const [conversionResult, activeClientsResult] = await Promise.all([
    pool.query<{ count: string }>(`
      SELECT COUNT(*) AS count FROM (
        SELECT DISTINCT ON (client_id) client_id
        FROM releases
        WHERE created_at::date BETWEEN $1 AND $2
          AND status IN ('approved','released')
        ORDER BY client_id, created_at ASC
      ) first_releases
    `, [fromStr, toStr]),
    pool.query<{ count: string }>(`
      SELECT COUNT(*) AS count FROM clients WHERE deleted_at IS NULL
    `),
  ])

  const [prevConvResult] = await Promise.all([
    pool.query<{ count: string }>(`
      SELECT COUNT(*) AS count FROM (
        SELECT DISTINCT ON (client_id) client_id
        FROM releases
        WHERE created_at::date BETWEEN $1 AND $2
          AND status IN ('approved','released')
        ORDER BY client_id, created_at ASC
      ) first_releases
    `, [prevFromStr, prevToStr]),
  ])

  const convCurr = parseInt(conversionResult.rows[0]?.count ?? '0')
  const totalActive = parseInt(activeClientsResult.rows[0]?.count ?? '1') || 1
  const convRateCurr = parseFloat((convCurr / totalActive * 100).toFixed(1))
  const convPrev = parseInt(prevConvResult.rows[0]?.count ?? '0')
  const convRatePrev = parseFloat((convPrev / totalActive * 100).toFixed(1))

  const categoryMap: Record<string, number> = { VIRGIN: 0, FAVORABLE: 0, OTHERS: 0, EXISTING: 0 }
  for (const row of funnelResult.rows) {
    categoryMap[row.category] = parseInt(row.count)
  }

  return c.json({
    period,
    month: monthQuery ?? null,
    date_range: { from: fromStr, to: toStr },
    prev_date_range: { from: prevFromStr, to: prevToStr },
    kpis: {
      releases:        { current: rCurr, previous: rPrev, change_pct: calcChangePct(rCurr, rPrev) },
      visits:          { current: vCurr, previous: vPrev, change_pct: calcChangePct(vCurr, vPrev) },
      calls:           { current: cCurr, previous: cPrev, change_pct: calcChangePct(cCurr, cPrev) },
      conversion_rate: { current: convRateCurr, previous: convRatePrev, change_pct: calcChangePct(convRateCurr, convRatePrev) },
    },
    funnel: (['VIRGIN', 'FAVORABLE', 'OTHERS', 'EXISTING'] as const).map(cat => ({
      category: cat, count: categoryMap[cat],
    })),
    releases_over_time: timelineResult.rows.map(r => ({
      bucket: r.bucket, count: parseInt(r.count),
    })),
    top_agents: agentsResult.rows.map(r => ({
      agent_name: r.agent_name,
      releases: parseInt(r.releases),
      visits: parseInt(r.visits),
    })),
  })
})

// GET /api/reports/agent-performance - Field agent performance report
reports.get('/agent-performance', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const period = c.req.query('period') || 'month';
    const caravanId = c.req.query('user_id');
    const municipality = c.req.query('municipality');
    const province = c.req.query('province');
    const { startDate, endDate } = getDateRange(period);

    // Only admin/staff can view all, field agents can only see their own
    let whereClause = 'WHERE t.created_at::date >= $1 AND t.created_at::date <= $2';
    const params: any[] = [startDate, endDate];
    let paramIndex = 3;

    if (user.role === 'caravan') {
      whereClause += ` AND t.user_id = $${paramIndex}`;
      params.push(user.sub);
    } else if (caravanId) {
      whereClause += ` AND t.user_id = $${paramIndex}`;
      params.push(caravanId);
      paramIndex++;
    }

    if (municipality) {
      whereClause += ` AND c.municipality_id = $${paramIndex}`;
      params.push(municipality);
      paramIndex++;
    }

    if (province) {
      whereClause += ` AND c.province = $${paramIndex}`;
      params.push(province);
      paramIndex++;
    }

    const result = await pool.query(
      `SELECT
        t.user_id,
        u.first_name,
        u.last_name,
        COUNT(DISTINCT t.id) as total_touchpoints,
        COUNT(DISTINCT CASE WHEN t.type = 'Visit' THEN t.id END) as total_visits,
        COUNT(DISTINCT CASE WHEN t.type = 'Call' THEN t.id END) as total_calls,
        COUNT(DISTINCT t.client_id) as unique_clients_touched
       FROM touchpoints t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN clients c ON c.id = t.client_id
       ${whereClause}
       GROUP BY t.user_id, u.first_name, u.last_name
       ORDER BY total_touchpoints DESC`,
      params
    );

    return c.json({
      period,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      items: result.rows.map(row => ({
        user_id: row.user_id,
        agent_name: `${row.first_name} ${row.last_name}`,
        total_touchpoints: parseInt(row.total_touchpoints),
        total_visits: parseInt(row.total_visits),
        total_calls: parseInt(row.total_calls),
        unique_clients_touched: parseInt(row.unique_clients_touched)
      }))
    });
  } catch (error) {
    console.error('Agent performance report error:', error);
    throw new Error();
  }
});

// GET /api/reports/client-activity - Client engagement summary
reports.get('/client-activity', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const period = c.req.query('period') || 'month';
    const { startDate, endDate } = getDateRange(period);

    let whereClause = 'WHERE c.created_at >= $1 AND c.created_at <= $2';
    const params: any[] = [startDate, endDate];
    let paramIndex = 3;

    if (user.role === 'caravan') {
      whereClause += ` AND c.user_id = $${paramIndex}`;
      params.push(user.sub);
    }

    const result = await pool.query(
      `SELECT
        c.client_type,
        COUNT(*) as count,
        COUNT(DISTINCT CASE WHEN c.is_starred THEN 1 END) as starred_count
       FROM clients c
       ${whereClause}
       GROUP BY c.client_type`,
      params
    );

    // Get touchpoint activity
    let tpWhereClause = 'WHERE t.created_at::date >= $1 AND t.created_at::date <= $2';
    const tpParams: any[] = [startDate, endDate];
    paramIndex = 3;

    if (user.role === 'caravan') {
      tpWhereClause += ` AND t.user_id = $${paramIndex}`;
      tpParams.push(user.sub);
    }

    const touchpointActivity = await pool.query(
      `SELECT
        COUNT(*) as total_touchpoints,
        COUNT(DISTINCT client_id) as clients_with_activity,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_7_days,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as last_30_days
       FROM touchpoints t
       ${tpWhereClause}`,
      tpParams
    );

    const tpStats = touchpointActivity.rows[0];

    return c.json({
      period,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      client_summary: result.rows.map(row => ({
        client_type: row.client_type,
        count: parseInt(row.count),
        starred_count: parseInt(row.starred_count || 0)
      })),
      touchpoint_activity: {
        total_touchpoints: parseInt(tpStats.total_touchpoints || 0),
        clients_with_activity: parseInt(tpStats.clients_with_activity || 0),
        last_7_days: parseInt(tpStats.last_7_days || 0),
        last_30_days: parseInt(tpStats.last_30_days || 0)
      }
    });
  } catch (error) {
    console.error('Client activity report error:', error);
    throw new Error();
  }
});

// GET /api/reports/touchpoint-summary - Touchpoints by type, reason, status
reports.get('/touchpoint-summary', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const period = c.req.query('period') || 'month';
    const { startDate, endDate } = getDateRange(period);

    let whereClause = 'WHERE created_at::date >= $1 AND created_at::date <= $2';
    const params: any[] = [startDate, endDate];
    let paramIndex = 3;

    if (user.role === 'caravan') {
      whereClause += ` AND user_id = $${paramIndex}`;
      params.push(user.sub);
    }

    // By type
    const byType = await pool.query(
      `SELECT type, COUNT(*) as count FROM touchpoints ${whereClause} GROUP BY type`,
      params
    );

    // By rejection reason (top 10)
    const byReason = await pool.query(
      `SELECT rejection_reason, COUNT(*) as count FROM touchpoints ${whereClause} GROUP BY rejection_reason ORDER BY count DESC LIMIT 10`,
      params
    );

    // By touchpoint number
    const byNumber = await pool.query(
      `SELECT touchpoint_number, COUNT(*) as count FROM touchpoints ${whereClause} GROUP BY touchpoint_number ORDER BY touchpoint_number`,
      params
    );

    return c.json({
      period,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      by_type: byType.rows.map(r => ({ type: r.type, count: parseInt(r.count) })),
      by_rejection_reason: byReason.rows.map(r => ({ rejection_reason: r.rejection_reason, count: parseInt(r.count) })),
      by_touchpoint_number: byNumber.rows.map(r => ({
        touchpoint_number: r.touchpoint_number,
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('Touchpoint summary report error:', error);
    throw new Error();
  }
});

// GET /api/reports/attendance-summary - Attendance report
reports.get('/attendance-summary', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const period = c.req.query('period') || 'month';
    const caravanId = c.req.query('user_id');
    const { startDate, endDate } = getDateRange(period);

    let whereClause = 'WHERE a.date >= $1 AND a.date <= $2';
    const params: any[] = [startDate, endDate];
    let paramIndex = 3;

    if (user.role === 'caravan') {
      whereClause += ` AND a.user_id = $${paramIndex}`;
      params.push(user.sub);
    } else if (caravanId) {
      whereClause += ` AND a.user_id = $${paramIndex}`;
      params.push(caravanId);
    }

    const result = await pool.query(
      `SELECT
        a.user_id as user_id,
        u.first_name,
        u.last_name,
        COUNT(*) as total_days,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_days,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_days,
        COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late_days,
        AVG(EXTRACT(EPOCH FROM (a.time_out - a.time_in))/3600) as avg_work_hours
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       ${whereClause}
       GROUP BY a.user_id, u.first_name, u.last_name
       ORDER BY present_days DESC`,
      params
    );

    return c.json({
      period,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      items: result.rows.map(row => ({
        user_id: row.user_id,
        agent_name: `${row.first_name} ${row.last_name}`,
        total_days: parseInt(row.total_days),
        present_days: parseInt(row.present_days),
        absent_days: parseInt(row.absent_days),
        late_days: parseInt(row.late_days),
        avg_work_hours: row.avg_work_hours ? parseFloat(row.avg_work_hours).toFixed(2) : '0.00',
        attendance_rate: row.total_days > 0
          ? Math.round((parseInt(row.present_days) / parseInt(row.total_days)) * 100)
          : 0
      }))
    });
  } catch (error) {
    console.error('Attendance summary report error:', error);
    throw new Error();
  }
});

// GET /api/reports/target-achievement - KPIs vs targets
reports.get('/target-achievement', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const year = parseInt(c.req.query('year') || new Date().getFullYear().toString());
    const month = parseInt(c.req.query('month') || (new Date().getMonth() + 1).toString());

    let userId: string = user.sub;
    const queryUserId = c.req.query('user_id');
    if (user.role !== 'caravan' && queryUserId) {
      userId = queryUserId;
    }

    // Get target
    const targetResult = await pool.query(
      `SELECT * FROM targets WHERE user_id = $1 AND period = 'monthly' AND year = $2 AND month = $3`,
      [userId, year, month]
    );

    // Get actuals
    const actualsResult = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM clients WHERE user_id = $1 AND deleted_at IS NULL
         AND EXTRACT(MONTH FROM created_at) = $2 AND EXTRACT(YEAR FROM created_at) = $3) as actual_clients,
        (SELECT COUNT(*) FROM touchpoints WHERE user_id = $1
         AND EXTRACT(MONTH FROM created_at) = $2 AND EXTRACT(YEAR FROM created_at) = $3) as actual_touchpoints,
        (SELECT COUNT(*) FROM touchpoints WHERE user_id = $1 AND type = 'Visit'
         AND EXTRACT(MONTH FROM created_at) = $2 AND EXTRACT(YEAR FROM created_at) = $3) as actual_visits`,
      [userId, month, year]
    );

    const target = targetResult.rows[0];
    const actuals = actualsResult.rows[0];

    const response: any = {
      year,
      month,
      user_id: userId,
      actual: {
        clients: parseInt(actuals.actual_clients || 0),
        touchpoints: parseInt(actuals.actual_touchpoints || 0),
        visits: parseInt(actuals.actual_visits || 0)
      }
    };

    if (target) {
      response.target = {
        clients: target.target_clients,
        touchpoints: target.target_touchpoints,
        visits: target.target_visits
      };
      response.achievement = {
        clients_percentage: target.target_clients > 0
          ? Math.round((parseInt(actuals.actual_clients || 0) / target.target_clients) * 100)
          : 0,
        touchpoints_percentage: target.target_touchpoints > 0
          ? Math.round((parseInt(actuals.actual_touchpoints || 0) / target.target_touchpoints) * 100)
          : 0,
        visits_percentage: target.target_visits > 0
          ? Math.round((parseInt(actuals.actual_visits || 0) / target.target_visits) * 100)
          : 0
      };
      response.status = response.achievement.clients_percentage >= 100 ? 'achieved' :
                        response.achievement.clients_percentage >= 75 ? 'on_track' : 'behind';
    } else {
      response.target = null;
      response.achievement = null;
      response.status = 'no_target';
    }

    return c.json(response);
  } catch (error) {
    console.error('Target achievement report error:', error);
    throw new Error();
  }
});

// GET /api/reports/conversion - POTENTIAL to EXISTING client conversions
reports.get('/conversion', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const period = c.req.query('period') || 'month';
    const { startDate, endDate } = getDateRange(period);

    let whereClause = 'WHERE c.created_at >= $1 AND c.created_at <= $2';
    const params: any[] = [startDate, endDate];
    let paramIndex = 3;

    if (user.role === 'caravan') {
      whereClause += ` AND c.user_id = $${paramIndex}`;
      params.push(user.sub);
    }

    // Conversion funnel
    const funnelResult = await pool.query(
      `SELECT
        COUNT(*) as total_clients,
        COUNT(CASE WHEN c.client_type = 'POTENTIAL' THEN 1 END) as potential_clients,
        COUNT(CASE WHEN c.client_type = 'EXISTING' THEN 1 END) as existing_clients
       FROM clients c
       ${whereClause}`,
      params
    );

    // Conversions by touchpoint count
    const conversionByTouchpoint = await pool.query(
      `SELECT
        t.touchpoint_number,
        COUNT(DISTINCT CASE WHEN c.client_type = 'EXISTING' THEN c.id END) as conversions,
        COUNT(DISTINCT c.id) as total_clients
       FROM clients c
       JOIN touchpoints t ON t.client_id = c.id
       ${whereClause}
       GROUP BY t.touchpoint_number
       ORDER BY t.touchpoint_number`,
      params
    );

    // Conversion by reason (which touchpoint reasons lead to conversions)
    const conversionByReason = await pool.query(
      `SELECT
        t.reason,
        COUNT(DISTINCT CASE WHEN c.client_type = 'EXISTING' THEN c.id END) as conversions
       FROM clients c
       JOIN touchpoints t ON t.client_id = c.id
       ${whereClause}
       GROUP BY t.reason
       ORDER BY conversions DESC
       LIMIT 10`,
      params
    );

    const funnel = funnelResult.rows[0];
    const total = parseInt(funnel.total_clients || 0);
    const potential = parseInt(funnel.potential_clients || 0);
    const existing = parseInt(funnel.existing_clients || 0);

    return c.json({
      period,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      funnel: {
        total_clients: total,
        potential_clients: potential,
        existing_clients: existing,
        conversion_rate: total > 0 ? Math.round((existing / total) * 100) : 0
      },
      conversion_by_touchpoint: conversionByTouchpoint.rows.map(r => ({
        touchpoint_number: r.touchpoint_number,
        conversions: parseInt(r.conversions),
        total_clients: parseInt(r.total_clients),
        rate: r.total_clients > 0 ? Math.round((parseInt(r.conversions) / parseInt(r.total_clients)) * 100) : 0
      })),
      top_converting_reasons: conversionByReason.rows.map(r => ({
        reason: r.reason,
        conversions: parseInt(r.conversions)
      }))
    });
  } catch (error) {
    console.error('Conversion report error:', error);
    throw new Error();
  }
});

// GET /api/reports/area-coverage - Geographic distribution of visits
reports.get('/area-coverage', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const period = c.req.query('period') || 'month';
    const { startDate, endDate } = getDateRange(period);

    let whereClause = 'WHERE t.created_at::date >= $1 AND t.created_at::date <= $2';
    const params: any[] = [startDate, endDate];
    let paramIndex = 3;

    if (user.role === 'caravan') {
      whereClause += ` AND t.user_id = $${paramIndex}`;
      params.push(user.sub);
    }

    // Coverage by city
    const byCity = await pool.query(
      `SELECT
        a.city,
        COUNT(DISTINCT t.id) as touchpoints,
        COUNT(DISTINCT t.client_id) as unique_clients,
        COUNT(DISTINCT CASE WHEN t.type = 'Visit' THEN t.id END) as visits
       FROM touchpoints t
       JOIN clients c ON c.id = t.client_id AND c.deleted_at IS NULL
       LEFT JOIN addresses a ON a.client_id = c.id AND a.is_primary = true
       ${whereClause}
       GROUP BY a.city
       ORDER BY touchpoints DESC`,
      params
    );

    // Coverage by province
    const byProvince = await pool.query(
      `SELECT
        a.province,
        COUNT(DISTINCT t.id) as touchpoints,
        COUNT(DISTINCT t.client_id) as unique_clients
       FROM touchpoints t
       JOIN clients c ON c.id = t.client_id AND c.deleted_at IS NULL
       LEFT JOIN addresses a ON a.client_id = c.id AND a.is_primary = true
       ${whereClause}
       GROUP BY a.province
       ORDER BY touchpoints DESC`,
      params
    );

    // Total coverage stats
    const coverageStats = await pool.query(
      `SELECT
        COUNT(DISTINCT t.client_id) as clients_visited,
        COUNT(DISTINCT a.city) as cities_covered,
        COUNT(DISTINCT a.province) as provinces_covered
       FROM touchpoints t
       JOIN clients c ON c.id = t.client_id AND c.deleted_at IS NULL
       LEFT JOIN addresses a ON a.client_id = c.id AND a.is_primary = true
       ${whereClause}`,
      params
    );

    const stats = coverageStats.rows[0];

    return c.json({
      period,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      summary: {
        clients_visited: parseInt(stats.clients_visited || 0),
        cities_covered: parseInt(stats.cities_covered || 0),
        provinces_covered: parseInt(stats.provinces_covered || 0)
      },
      by_city: byCity.rows.map(r => ({
        city: r.city || 'Unknown',
        touchpoints: parseInt(r.touchpoints),
        unique_clients: parseInt(r.unique_clients),
        visits: parseInt(r.visits)
      })),
      by_province: byProvince.rows.map(r => ({
        province: r.province || 'Unknown',
        touchpoints: parseInt(r.touchpoints),
        unique_clients: parseInt(r.unique_clients)
      }))
    });
  } catch (error) {
    console.error('Area coverage report error:', error);
    throw new Error();
  }
});

// GET /api/reports/export - Export report data as CSV
reports.get('/export', authMiddleware, requirePermission('reports', 'export'), async (c) => {
  try {
    const user = c.get('user');
    const reportType = c.req.query('type') || 'touchpoints';
    const period = c.req.query('period') || 'month';
    const { startDate, endDate } = getDateRange(period);

    // Only admin/staff can export
    if (user.role === 'caravan') {
      throw new AuthorizationError('Unauthorized');
    }

    let csvData = '';
    let filename = '';

    switch (reportType) {
      case 'touchpoints':
        const tpResult = await pool.query(
          `SELECT t.id, t.created_at, t.type, t.rejection_reason, t.visit_id, t.call_id,
                  c.first_name as client_first_name, c.last_name as client_last_name,
                  u.first_name as agent_first_name, u.last_name as agent_last_name
           FROM touchpoints t
           JOIN clients c ON c.id = t.client_id AND c.deleted_at IS NULL
           JOIN users u ON u.id = t.user_id
           WHERE t.created_at::date >= $1 AND t.created_at::date <= $2
           ORDER BY t.created_at DESC`,
          [startDate, endDate]
        );
        csvData = 'ID,Created At,Type,Rejection Reason,Visit ID,Call ID,Client,Agent\n';
        csvData += tpResult.rows.map(r =>
          `"${r.id}","${r.created_at}","${r.type}","${r.rejection_reason || ''}","${r.visit_id || ''}","${r.call_id || ''}","${r.client_first_name} ${r.client_last_name}","${r.agent_first_name} ${r.agent_last_name}"`
        ).join('\n');
        filename = `touchpoints_${period}.csv`;
        break;

      case 'clients':
        const clientResult = await pool.query(
          `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.client_type,
                  c.product_type, c.market_type, c.created_at,
                  u.first_name as agent_first_name, u.last_name as agent_last_name
           FROM clients c
           LEFT JOIN users u ON u.id = c.user_id
           WHERE c.created_at >= $1 AND c.created_at <= $2
           ORDER BY c.created_at DESC`,
          [startDate, endDate]
        );
        csvData = 'ID,First Name,Last Name,Email,Phone,Type,Product Type,Market Type,Agent,Created\n';
        csvData += clientResult.rows.map(r =>
          `"${r.id}","${r.first_name}","${r.last_name}","${r.email || ''}","${r.phone || ''}","${r.client_type}","${r.product_type || ''}","${r.market_type || ''}","${r.agent_first_name || ''} ${r.agent_last_name || ''}","${r.created_at}"`
        ).join('\n');
        filename = `clients_${period}.csv`;
        break;

      case 'attendance':
        const attResult = await pool.query(
          `SELECT a.id, a.date, a.check_in, a.check_out, a.status,
                  u.first_name, u.last_name
           FROM attendance a
           JOIN users u ON u.id = a.user_id
           WHERE a.date >= $1 AND a.date <= $2
           ORDER BY a.date DESC`,
          [startDate, endDate]
        );
        csvData = 'ID,Date,Agent,Check In,Check Out,Status\n';
        csvData += attResult.rows.map(r =>
          `"${r.id}","${r.date}","${r.first_name} ${r.last_name}","${r.check_in || ''}","${r.check_out || ''}","${r.status}"`
        ).join('\n');
        filename = `attendance_${period}.csv`;
        break;

      default:
        throw new ValidationError('Invalid report type');
    }

    return c.json({
      filename,
      content: csvData,
      mime_type: 'text/csv'
    });
  } catch (error) {
    console.error('Export report error:', error);
    throw new Error();
  }
});

// POST /api/reports/generate - Generate a report asynchronously (queued)
reports.post('/generate', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ message: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();

    // Validation schema
    const generateReportSchema = z.object({
      reportType: z.enum([
        'agent_performance',
        'client_activity',
        'touchpoint_summary',
        'attendance_summary',
        'target_achievement',
        'conversion',
        'area_coverage'
      ]),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      userId: z.string().uuid().optional(),
      municipality: z.string().optional(),
      province: z.string().optional(),
      clientType: z.string().optional(),
    });

    const validated = generateReportSchema.parse(body);

    // Map report type to job type
    const reportTypeMap: Record<string, ReportJobType> = {
      agent_performance: ReportJobType.REPORT_AGENT_PERFORMANCE,
      client_activity: ReportJobType.REPORT_CLIENT_ACTIVITY,
      touchpoint_summary: ReportJobType.REPORT_TOUCHPOINT_SUMMARY,
      attendance_summary: ReportJobType.REPORT_ATTENDANCE_SUMMARY,
      target_achievement: ReportJobType.REPORT_TARGET_ACHIEVEMENT,
      conversion: ReportJobType.REPORT_CONVERSION,
      area_coverage: ReportJobType.REPORT_AREA_COVERAGE,
    };

    const jobType = reportTypeMap[validated.reportType];
    if (!jobType) {
      throw new ValidationError('Invalid report type');
    }

    // Create report generation job
    const job = await addReportJob(
      jobType,
      user.sub,
      {
        startDate: validated.startDate,
        endDate: validated.endDate,
        userId: validated.userId,
        municipality: validated.municipality,
        province: validated.province,
        clientType: validated.clientType,
      }
    );

    // Return immediately with job information
    return c.json({
      success: true,
      job_id: job.id,
      message: `Report generation job started for ${validated.reportType}`,
      status_url: `/api/jobs/queue/${job.id}`,
      estimated_time: '1-2 minutes',
    }, 201);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Generate report error:', error);
    throw new Error('Failed to create report job');
  }
});

// POST /api/reports/export-csv - Export data to CSV asynchronously (queued)
reports.post('/export-csv', authMiddleware, requirePermission('reports', 'export'), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ message: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();

    // Validation schema
    const exportCsvSchema = z.object({
      exportType: z.enum([
        'touchpoints',
        'clients',
        'attendance'
      ]),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      userId: z.string().uuid().optional(),
      municipality: z.string().optional(),
      province: z.string().optional(),
      clientType: z.string().optional(),
    });

    const validated = exportCsvSchema.parse(body);

    // Map export type to job type
    const exportTypeMap: Record<string, ReportJobType> = {
      touchpoints: ReportJobType.EXPORT_TOUCHPOINTS_CSV,
      clients: ReportJobType.EXPORT_CLIENTS_CSV,
      attendance: ReportJobType.EXPORT_ATTENDANCE_CSV,
    };

    const jobType = exportTypeMap[validated.exportType];
    if (!jobType) {
      throw new ValidationError('Invalid export type');
    }

    // Create CSV export job
    const job = await addReportJob(
      jobType,
      user.sub,
      {
        startDate: validated.startDate,
        endDate: validated.endDate,
        userId: validated.userId,
        municipality: validated.municipality,
        province: validated.province,
        clientType: validated.clientType,
      }
    );

    // Return immediately with job information
    return c.json({
      success: true,
      job_id: job.id,
      message: `CSV export job started for ${validated.exportType}`,
      status_url: `/api/jobs/queue/${job.id}`,
      estimated_time: '2-5 minutes',
    }, 201);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Export CSV error:', error);
    throw new Error('Failed to create CSV export job');
  }
});

// GET /api/reports/releases - Releases report
reports.get('/releases', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const status = c.req.query('status');
    const productType = c.req.query('product_type');
    const loanType = c.req.query('loan_type');
    const limit = parseInt(c.req.query('limit') || '1000');

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    // Only admin/staff can view all, field agents can only see their own
    if (user.role === 'caravan') {
      whereClause += ` AND r.user_id = $${paramIndex++}`;
      params.push(user.sub);
    }

    // Date range filter
    if (startDate || endDate) {
      const dateCondition = getDateRangeCondition(startDate, endDate, 'r.created_at');
      whereClause += ` AND ${dateCondition.condition}`;
      params.push(...dateCondition.params);
      paramIndex += dateCondition.params.length;
    }

    // Status filter
    if (status) {
      whereClause += ` AND r.status = $${paramIndex++}`;
      params.push(status);
    }

    // Product type filter
    if (productType) {
      whereClause += ` AND r.product_type = $${paramIndex++}`;
      params.push(productType);
    }

    // Loan type filter
    if (loanType) {
      whereClause += ` AND r.loan_type = $${paramIndex++}`;
      params.push(loanType);
    }

    const query = `
      SELECT
        r.id,
        r.client_id,
        c.first_name,
        c.middle_name,
        c.last_name,
        r.user_id,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name,
        r.visit_id,
        r.product_type,
        r.loan_type,
        r.udi_number,
        r.status,
        r.approval_notes,
        r.approved_by,
        r.approved_at,
        r.created_at,
        r.updated_at
      FROM releases r
      JOIN clients c ON c.id = r.client_id
      JOIN users u ON u.id = r.user_id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramIndex}
    `;

    params.push(limit);

    const result = await pool.query(query, params);

    return c.json({
      items: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Releases report error:', error);
    throw new Error('Failed to fetch releases report');
  }
});

// GET /api/reports/visits - Visits report
reports.get('/visits', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const type = c.req.query('type');
    const limit = parseInt(c.req.query('limit') || '1000');

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    // Only admin/staff can view all, field agents can only see their own
    if (user.role === 'caravan') {
      whereClause += ` AND v.user_id = $${paramIndex++}`;
      params.push(user.sub);
    }

    // Date range filter
    if (startDate || endDate) {
      const dateCondition = getDateRangeCondition(startDate, endDate, 'v.created_at');
      whereClause += ` AND ${dateCondition.condition}`;
      params.push(...dateCondition.params);
      paramIndex += dateCondition.params.length;
    }

    // Type filter
    if (type) {
      whereClause += ` AND v.type = $${paramIndex++}`;
      params.push(type);
    }

    const query = `
      SELECT
        v.id,
        v.client_id,
        c.first_name,
        c.middle_name,
        c.last_name,
        v.user_id,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name,
        v.type,
        v.time_in,
        v.time_out,
        v.odometer_arrival,
        v.odometer_departure,
        v.photo_url,
        v.remarks,
        v.reason,
        v.status,
        v.address,
        v.latitude,
        v.longitude,
        v.created_at,
        v.updated_at
      FROM visits v
      JOIN clients c ON c.id = v.client_id
      JOIN users u ON u.id = v.user_id
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT $${paramIndex}
    `;

    params.push(limit);

    const result = await pool.query(query, params);

    return c.json({
      items: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Visits report error:', error);
    throw new Error('Failed to fetch visits report');
  }
});

// GET /api/reports/preview-count - Preview record count for export
reports.get('/preview-count', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const reportType = c.req.query('type') || 'releases';
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');

    // Validate date range
    validateDateRange(startDate, endDate);

    // Only admin/staff can preview
    if (user.role === 'caravan') {
      throw new AuthorizationError('Unauthorized');
    }

    // Get report query using helper
    const { query, params } = getReportQuery(reportType as 'releases' | 'visits', startDate, endDate);
    const count = await getRecordCount(query, params);

    return c.json({
      type: reportType,
      start_date: startDate || 'all',
      end_date: endDate || 'all',
      record_count: count,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'End date must be on or after start date') {
      throw new ValidationError(error.message);
    }
    console.error('Preview count error:', error);
    throw new Error('Failed to get record count');
  }
});

// GET /api/reports/export/csv - Export report data as CSV
reports.get('/export/csv', authMiddleware, requirePermission('reports', 'export'), async (c) => {
  try {
    const user = c.get('user');
    const reportType = c.req.query('type') || 'releases';
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const { formatDate: _formatDate } = await import('../utils/csv-export.js');

    // Validate date range
    validateDateRange(startDate, endDate);

    // Only admin/staff can export
    if (user.role === 'caravan') {
      throw new AuthorizationError('Unauthorized');
    }

    // Get report query and config using helpers
    const { query, params } = getReportQuery(reportType as 'releases' | 'visits', startDate, endDate);
    const config = getReportExportConfig(reportType as 'releases' | 'visits', startDate, endDate);
    const csvData = await exportToCsv(query, params, config);

    return c.body(csvData.content, 200, {
      'Content-Type': csvData.mime_type,
      'Content-Disposition': `attachment; filename="${csvData.filename}"`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'End date must be on or after start date') {
      throw new ValidationError(error.message);
    }
    console.error('Export CSV error:', error);
    throw new Error('Failed to export CSV');
  }
});

// GET /api/reports/export/excel - Export report data as Excel
reports.get('/export/excel', authMiddleware, requirePermission('reports', 'export'), async (c) => {
  try {
    const user = c.get('user');
    const reportType = c.req.query('type') || 'touchpoints';
    const period = c.req.query('period') || 'month';
    const { startDate, endDate } = getDateRange(period);

    // Only admin/staff can export
    if (user.role === 'caravan') {
      throw new AuthorizationError('Unauthorized');
    }

    let excelBuffer: Buffer;
    let filename = '';

    switch (reportType) {
      case 'touchpoints':
        excelBuffer = await exportTouchpointsToExcel(pool, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
        filename = `touchpoints_${period}.xlsx`;
        break;

      case 'clients':
        excelBuffer = await exportClientsToExcel(pool, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
        filename = `clients_${period}.xlsx`;
        break;

      case 'attendance':
        excelBuffer = await exportAttendanceToExcel(pool, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
        filename = `attendance_${period}.xlsx`;
        break;

      default:
        throw new ValidationError('Invalid report type');
    }

    return c.body(new Uint8Array(excelBuffer), 200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
  } catch (error) {
    console.error('Export Excel error:', error);
    throw new Error('Failed to export Excel');
  }
});

// GET /api/reports/daily-visits - Daily visit counts per agent (caravan touchpoints)
reports.get('/daily-visits', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const detail = c.req.query('detail') === 'true';
    const limit = parseInt(c.req.query('limit') || '1000');

    // Default last 30 days if both dates missing
    const now = new Date();
    const defaultEnd = now.toISOString().split('T')[0];
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = c.req.query('start_date') || defaultStart;
    const endDate = c.req.query('end_date') || defaultEnd;
    const filterUserId = c.req.query('user_id');

    const params: any[] = [];
    let paramIndex = 1;

    let whereClause = 'WHERE 1=1';

    // Date range
    whereClause += ` AND v.time_in >= $${paramIndex++}`;
    params.push(startDate);
    whereClause += ` AND v.time_in <= $${paramIndex++}`;
    params.push(endDate + 'T23:59:59.999Z');

    // Caravan agents see only their own; admin/staff can filter by user_id
    if (user.role === 'caravan') {
      whereClause += ` AND v.user_id = $${paramIndex++}`;
      params.push(user.sub);
    } else if (filterUserId) {
      whereClause += ` AND v.user_id = $${paramIndex++}`;
      params.push(filterUserId);
    }

    if (detail) {
      const detailQuery = `
        SELECT
          v.id,
          v.user_id,
          u.first_name || ' ' || u.last_name AS agent_name,
          u.role,
          c.first_name || ' ' || c.last_name AS client_name,
          v.time_in,
          v.time_out,
          v.address,
          v.type,
          v.remarks
        FROM visits v
        JOIN users u ON u.id = v.user_id
        JOIN clients c ON c.id = v.client_id
        ${whereClause}
        ORDER BY v.time_in DESC
        LIMIT $${paramIndex}
      `;
      params.push(limit);
      const result = await pool.query(detailQuery, params);
      return c.json({ items: result.rows, total: result.rows.length });
    }

    const aggregateQuery = `
      SELECT
        date(v.time_in) AS visit_date,
        v.user_id,
        u.first_name || ' ' || u.last_name AS agent_name,
        u.role,
        COUNT(*) AS visit_count,
        COUNT(*) FILTER (WHERE v.type = 'release_loan') AS release_visit_count,
        COUNT(*) FILTER (WHERE v.type = 'regular_visit') AS regular_visit_count
      FROM visits v
      JOIN users u ON u.id = v.user_id
      ${whereClause}
      GROUP BY date(v.time_in), v.user_id, u.first_name, u.last_name, u.role
      ORDER BY visit_date DESC, agent_name
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await pool.query(aggregateQuery, params);
    return c.json({ items: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Daily visits report error:', error);
    throw new Error('Failed to fetch daily visits report');
  }
});

// GET /api/reports/daily-calls - Daily call counts per agent (tele touchpoints)
reports.get('/daily-calls', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const detail = c.req.query('detail') === 'true';
    const limit = parseInt(c.req.query('limit') || '1000');

    // Default last 30 days if both dates missing
    const now = new Date();
    const defaultEnd = now.toISOString().split('T')[0];
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = c.req.query('start_date') || defaultStart;
    const endDate = c.req.query('end_date') || defaultEnd;
    const filterUserId = c.req.query('user_id');

    const params: any[] = [];
    let paramIndex = 1;

    let whereClause = 'WHERE 1=1';

    // Date range
    whereClause += ` AND c.dial_time >= $${paramIndex++}`;
    params.push(startDate);
    whereClause += ` AND c.dial_time <= $${paramIndex++}`;
    params.push(endDate + 'T23:59:59.999Z');

    // Caravan agents see only their own; admin/staff can filter by user_id
    if (user.role === 'caravan') {
      whereClause += ` AND c.user_id = $${paramIndex++}`;
      params.push(user.sub);
    } else if (filterUserId) {
      whereClause += ` AND c.user_id = $${paramIndex++}`;
      params.push(filterUserId);
    }

    if (detail) {
      const detailQuery = `
        SELECT
          c.id,
          c.user_id,
          u.first_name || ' ' || u.last_name AS agent_name,
          u.role,
          cl.first_name || ' ' || cl.last_name AS client_name,
          c.phone_number,
          c.dial_time,
          c.duration,
          c.type,
          c.notes
        FROM calls c
        JOIN users u ON u.id = c.user_id
        JOIN clients cl ON cl.id = c.client_id
        ${whereClause}
        ORDER BY c.dial_time DESC
        LIMIT $${paramIndex}
      `;
      params.push(limit);
      const result = await pool.query(detailQuery, params);
      return c.json({ items: result.rows, total: result.rows.length });
    }

    const aggregateQuery = `
      SELECT
        date(c.dial_time) AS call_date,
        c.user_id,
        u.first_name || ' ' || u.last_name AS agent_name,
        u.role,
        COUNT(*) AS call_count,
        COUNT(*) FILTER (WHERE c.type = 'release_loan') AS release_call_count,
        COUNT(*) FILTER (WHERE c.type = 'regular_call') AS regular_call_count
      FROM calls c
      JOIN users u ON u.id = c.user_id
      ${whereClause}
      GROUP BY date(c.dial_time), c.user_id, u.first_name, u.last_name, u.role
      ORDER BY call_date DESC, agent_name
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await pool.query(aggregateQuery, params);
    return c.json({ items: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Daily calls report error:', error);
    throw new Error('Failed to fetch daily calls report');
  }
});

// GET /api/reports/caravan-releases - Releases originating from a caravan visit
reports.get('/caravan-releases', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit') || '1000');

    // Default last 30 days if both dates missing
    const now = new Date();
    const defaultEnd = now.toISOString().split('T')[0];
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = c.req.query('start_date') || defaultStart;
    const endDate = c.req.query('end_date') || defaultEnd;
    const filterUserId = c.req.query('user_id');
    const productType = c.req.query('product_type');
    const loanType = c.req.query('loan_type');
    const status = c.req.query('status');

    const params: any[] = [];
    let paramIndex = 1;

    let whereClause = 'WHERE r.visit_id IS NOT NULL';

    // Date range
    whereClause += ` AND r.created_at >= $${paramIndex++}`;
    params.push(startDate);
    whereClause += ` AND r.created_at <= $${paramIndex++}`;
    params.push(endDate + 'T23:59:59.999Z');

    // Caravan agents see only their own; admin/staff can filter by user_id
    if (user.role === 'caravan') {
      whereClause += ` AND r.user_id = $${paramIndex++}`;
      params.push(user.sub);
    } else if (filterUserId) {
      whereClause += ` AND r.user_id = $${paramIndex++}`;
      params.push(filterUserId);
    }

    if (productType) {
      whereClause += ` AND r.product_type = $${paramIndex++}`;
      params.push(productType);
    }

    if (loanType) {
      whereClause += ` AND r.loan_type = $${paramIndex++}`;
      params.push(loanType);
    }

    if (status) {
      whereClause += ` AND r.status = $${paramIndex++}`;
      params.push(status);
    }

    const query = `
      SELECT
        r.id,
        r.created_at,
        cl.first_name || ' ' || cl.last_name AS client_name,
        cl.id AS client_id,
        u.first_name || ' ' || u.last_name AS agent_name,
        u.id AS agent_id,
        r.product_type,
        r.loan_type,
        r.udi_number,
        r.status,
        r.approved_at,
        r.visit_id,
        v.time_in AS visit_time_in,
        v.time_out AS visit_time_out,
        v.address AS visit_address
      FROM releases r
      JOIN clients cl ON cl.id = r.client_id
      JOIN users u ON u.id = r.user_id
      LEFT JOIN visits v ON v.id = r.visit_id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await pool.query(query, params);
    return c.json({ items: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Caravan releases report error:', error);
    throw new Error('Failed to fetch caravan releases report');
  }
});

// GET /api/reports/tele-releases - Releases originating from a tele call
reports.get('/tele-releases', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit') || '1000');

    // Default last 30 days if both dates missing
    const now = new Date();
    const defaultEnd = now.toISOString().split('T')[0];
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = c.req.query('start_date') || defaultStart;
    const endDate = c.req.query('end_date') || defaultEnd;
    const filterUserId = c.req.query('user_id');
    const productType = c.req.query('product_type');
    const loanType = c.req.query('loan_type');
    const status = c.req.query('status');

    const params: any[] = [];
    let paramIndex = 1;

    let whereClause = 'WHERE r.call_id IS NOT NULL';

    // Date range
    whereClause += ` AND r.created_at >= $${paramIndex++}`;
    params.push(startDate);
    whereClause += ` AND r.created_at <= $${paramIndex++}`;
    params.push(endDate + 'T23:59:59.999Z');

    // Caravan agents see only their own; admin/staff can filter by user_id
    if (user.role === 'caravan') {
      whereClause += ` AND r.user_id = $${paramIndex++}`;
      params.push(user.sub);
    } else if (filterUserId) {
      whereClause += ` AND r.user_id = $${paramIndex++}`;
      params.push(filterUserId);
    }

    if (productType) {
      whereClause += ` AND r.product_type = $${paramIndex++}`;
      params.push(productType);
    }

    if (loanType) {
      whereClause += ` AND r.loan_type = $${paramIndex++}`;
      params.push(loanType);
    }

    if (status) {
      whereClause += ` AND r.status = $${paramIndex++}`;
      params.push(status);
    }

    const query = `
      SELECT
        r.id,
        r.created_at,
        cl.first_name || ' ' || cl.last_name AS client_name,
        cl.id AS client_id,
        u.first_name || ' ' || u.last_name AS agent_name,
        u.id AS agent_id,
        r.product_type,
        r.loan_type,
        r.udi_number,
        r.status,
        r.approved_at,
        r.call_id,
        ca.phone_number AS call_phone_number,
        ca.dial_time AS call_dial_time,
        ca.duration AS call_duration
      FROM releases r
      JOIN clients cl ON cl.id = r.client_id
      JOIN users u ON u.id = r.user_id
      LEFT JOIN calls ca ON ca.id = r.call_id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await pool.query(query, params);
    return c.json({ items: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Tele releases report error:', error);
    throw new Error('Failed to fetch tele releases report');
  }
});

// GET /api/reports/odometer - Odometer/kilometers traveled per visit + daily agent rollup
reports.get('/odometer', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit') || '1000');

    // Default last 30 days if both dates missing
    const now = new Date();
    const defaultEnd = now.toISOString().split('T')[0];
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = c.req.query('start_date') || defaultStart;
    const endDate = c.req.query('end_date') || defaultEnd;
    const filterUserId = c.req.query('user_id');

    const params: any[] = [];
    let paramIndex = 1;

    let whereClause = 'WHERE 1=1';

    // Date range
    whereClause += ` AND v.time_in >= $${paramIndex++}`;
    params.push(startDate);
    whereClause += ` AND v.time_in <= $${paramIndex++}`;
    params.push(endDate + 'T23:59:59.999Z');

    // Caravan agents see only their own; admin/staff can filter by user_id
    if (user.role === 'caravan') {
      whereClause += ` AND v.user_id = $${paramIndex++}`;
      params.push(user.sub);
    } else if (filterUserId) {
      whereClause += ` AND v.user_id = $${paramIndex++}`;
      params.push(filterUserId);
    }

    // Detail rows: one per visit
    const detailQuery = `
      SELECT
        v.id,
        date(v.time_in) AS visit_date,
        u.first_name || ' ' || u.last_name AS agent_name,
        u.id AS agent_id,
        cl.first_name || ' ' || cl.last_name AS client_name,
        v.odometer_departure,
        v.odometer_arrival,
        v.kilometers_traveled,
        NULLIF(v.odometer_arrival, '')::numeric - NULLIF(v.odometer_departure, '')::numeric AS estimated_km
      FROM visits v
      JOIN users u ON u.id = v.user_id
      JOIN clients cl ON cl.id = v.client_id
      ${whereClause}
      ORDER BY v.time_in DESC
      LIMIT $${paramIndex}
    `;

    // Daily totals: per agent per day
    const dailyParams = params.slice(0, paramIndex - 1);
    let dailyParamIndex = paramIndex;
    const dailyQuery = `
      SELECT
        date(v.time_in) AS visit_date,
        v.user_id,
        u.first_name || ' ' || u.last_name AS agent_name,
        COUNT(*) AS visit_count,
        SUM(
          COALESCE(
            NULLIF(v.kilometers_traveled, '')::numeric,
            NULLIF(v.odometer_arrival, '')::numeric - NULLIF(v.odometer_departure, '')::numeric,
            0
          )
        ) AS total_km
      FROM visits v
      JOIN users u ON u.id = v.user_id
      ${whereClause}
      GROUP BY date(v.time_in), v.user_id, u.first_name, u.last_name
      ORDER BY visit_date DESC, agent_name
      LIMIT $${dailyParamIndex}
    `;

    const detailParamsFull = [...params, limit];
    const dailyParamsFull = [...dailyParams, limit];

    const [detailResult, dailyResult] = await Promise.all([
      pool.query(detailQuery, detailParamsFull),
      pool.query(dailyQuery, dailyParamsFull),
    ]);

    return c.json({
      daily_totals: dailyResult.rows,
      details: detailResult.rows,
      total: detailResult.rows.length,
    });
  } catch (error) {
    console.error('Odometer report error:', error);
    throw new Error('Failed to fetch odometer report');
  }
});

// GET /api/reports/releases-by-loan-type - Caravan-only releases with touchpoints-before-release count
reports.get('/releases-by-loan-type', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit') || '1000');

    // Default last 30 days if both dates missing
    const now = new Date();
    const defaultEnd = now.toISOString().split('T')[0];
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = c.req.query('start_date') || defaultStart;
    const endDate = c.req.query('end_date') || defaultEnd;
    const filterUserId = c.req.query('user_id');
    const productType = c.req.query('product_type');
    const loanType = c.req.query('loan_type');

    const params: any[] = [];
    let paramIndex = 1;

    let whereClause = 'WHERE r.visit_id IS NOT NULL';

    // Date range
    whereClause += ` AND r.created_at >= $${paramIndex++}`;
    params.push(startDate);
    whereClause += ` AND r.created_at <= $${paramIndex++}`;
    params.push(endDate + 'T23:59:59.999Z');

    // Caravan agents see only their own; admin/staff can filter by user_id
    if (user.role === 'caravan') {
      whereClause += ` AND r.user_id = $${paramIndex++}`;
      params.push(user.sub);
    } else if (filterUserId) {
      whereClause += ` AND r.user_id = $${paramIndex++}`;
      params.push(filterUserId);
    }

    if (loanType) {
      whereClause += ` AND r.loan_type = $${paramIndex++}`;
      params.push(loanType);
    }

    if (productType) {
      whereClause += ` AND r.product_type = $${paramIndex++}`;
      params.push(productType);
    }

    const itemsQuery = `
      SELECT
        r.id,
        r.created_at AS released_at,
        r.loan_type,
        r.product_type,
        r.udi_number,
        r.status,
        cl.first_name || ' ' || cl.last_name AS client_name,
        cl.id AS client_id,
        u.first_name || ' ' || u.last_name AS agent_name,
        u.id AS agent_id,
        (
          SELECT COUNT(*)
          FROM touchpoints t
          WHERE t.client_id = r.client_id
            AND t.created_at <= r.created_at
        ) AS touchpoints_before_release
      FROM releases r
      JOIN clients cl ON cl.id = r.client_id
      JOIN users u ON u.id = r.user_id
      ${whereClause}
      ORDER BY released_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await pool.query(itemsQuery, params);

    // Aggregate avg touchpoints per loan_type from the result set
    const byLoanType: Record<string, { loan_type: string; count: number; avg_touchpoints_before_release: number }> = {};
    for (const row of result.rows) {
      const lt = row.loan_type || 'unknown';
      if (!byLoanType[lt]) {
        byLoanType[lt] = { loan_type: lt, count: 0, avg_touchpoints_before_release: 0 };
      }
      byLoanType[lt].count += 1;
      byLoanType[lt].avg_touchpoints_before_release += Number(row.touchpoints_before_release) || 0;
    }
    for (const lt of Object.keys(byLoanType)) {
      const entry = byLoanType[lt];
      entry.avg_touchpoints_before_release = entry.count > 0
        ? Math.round((entry.avg_touchpoints_before_release / entry.count) * 100) / 100
        : 0;
    }

    return c.json({
      items: result.rows,
      by_loan_type: Object.values(byLoanType),
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Releases by loan type report error:', error);
    throw new Error('Failed to fetch releases by loan type report');
  }
});

// GET /api/reports/itinerary-analysis-preview - Sync preview (no Excel, no S3)
reports.get('/itinerary-analysis-preview', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  const startDate = c.req.query('start_date');
  const endDate   = c.req.query('end_date');

  if (!startDate || !endDate) {
    throw new ValidationError('start_date and end_date are required');
  }

  const { fetchItineraryAnalysisData } = await import('../queues/processors/handlers/itinerary-analysis-handler.js');
  const { agents, visitDetails, workingDays } = await fetchItineraryAnalysisData(pool, startDate, endDate);

  return c.json({
    working_days: workingDays,
    agents,
    visit_details_count: visitDetails.length,
  });
});

// POST /api/reports/itinerary-analysis/generate - Queue background Excel generation
reports.post('/itinerary-analysis/generate', authMiddleware, requirePermission('reports', 'read'), async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ message: 'Unauthorized' }, 401);

  const body = await c.req.json();
  const schema = z.object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be YYYY-MM-DD'),
    end_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be YYYY-MM-DD'),
  });

  const { start_date, end_date } = schema.parse(body);

  const job = await addReportJob(
    ReportJobType.REPORT_ITINERARY_ANALYSIS,
    user.sub,
    { startDate: start_date, endDate: end_date }
  );

  return c.json({ jobId: job.id }, 202);
});

export default reports;

