import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';

const touchpointsAnalytics = new Hono();

// GET /api/touchpoints/analytics - Get touchpoints analytics
touchpointsAnalytics.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const caravanIds = c.req.query('caravanIds');
    const clientTypes = c.req.query('clientTypes');
    const touchpointTypes = c.req.query('touchpointTypes');
    const status = c.req.query('status');

    // Helper function to validate and normalize date format
    // Accepts both ISO format (YYYY-MM-DDTHH:mm:ss.sssZ) and YYYY-MM-DD format
    const parseAndValidateDate = (dateStr: string): string | null => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      // Check if date is invalid
      if (!(date instanceof Date) || isNaN(date.getTime())) return null;

      // Normalize to YYYY-MM-DD format for database queries
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Validate and normalize date formats
    const normalizedStartDate = parseAndValidateDate(startDate ?? '');
    const normalizedEndDate = parseAndValidateDate(endDate ?? '');

    if (startDate && !normalizedStartDate) {
      return c.json({ message: 'Invalid startDate format. Use YYYY-MM-DD or ISO format' }, 400);
    }
    if (endDate && !normalizedEndDate) {
      return c.json({ message: 'Invalid endDate format. Use YYYY-MM-DD or ISO format' }, 400);
    }

    // Helper function to validate and split comma-separated values
    const parseCommaSeparated = (value: string | undefined): string[] | null => {
      if (!value) return null;
      const parts = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
      return parts.length > 0 ? parts : null;
    };

    // Parse and validate query parameters
    const parsedCaravanIds = parseCommaSeparated(caravanIds);
    const parsedClientTypes = parseCommaSeparated(clientTypes);
    const parsedTouchpointTypes = parseCommaSeparated(touchpointTypes);
    const parsedStatus = parseCommaSeparated(status);

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Role-based filtering: caravan and tele users can only see their own data
    if (user.role === 'caravan' || user.role === 'tele') {
      conditions.push(`t.user_id = $${paramIndex}`);
      params.push(user.sub);
      paramIndex++;
    }

    // Date range filter
    if (normalizedStartDate) {
      conditions.push(`t.date >= $${paramIndex}`);
      params.push(normalizedStartDate);
      paramIndex++;
    }
    if (normalizedEndDate) {
      conditions.push(`t.date <= $${paramIndex}`);
      params.push(normalizedEndDate);
      paramIndex++;
    }

    // Caravan filter (user_id) - only for admin/managers
    if (parsedCaravanIds && user.role !== 'caravan' && user.role !== 'tele') {
      conditions.push(`t.user_id = ANY($${paramIndex})`);
      params.push(parsedCaravanIds);
      paramIndex++;
    }

    // Client type filter
    if (parsedClientTypes) {
      conditions.push(`c.client_type = ANY($${paramIndex})`);
      params.push(parsedClientTypes);
      paramIndex++;
    }

    // Touchpoint type filter
    if (parsedTouchpointTypes) {
      conditions.push(`t.type = ANY($${paramIndex})`);
      params.push(parsedTouchpointTypes);
      paramIndex++;
    }

    // Status filter
    if (parsedStatus) {
      conditions.push(`t.status = ANY($${paramIndex})`);
      params.push(parsedStatus);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    console.log('🔍 Analytics query params:', params);
    console.log('🔍 Analytics whereClause:', whereClause);

    // 1. Summary Query
    const summaryResult = await pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'Completed') as completed,
        COUNT(*) FILTER (WHERE t.status IN ('Interested', 'Undecided', 'Completed')) as converted,
        EXTRACT(EPOCH FROM AVG(t.time_out - t.time_in)) / 60 as avg_time_minutes
       FROM touchpoints t
       LEFT JOIN clients c ON c.id = t.client_id
       ${whereClause}`,
      params
    );

    const summaryRow = summaryResult.rows[0];
    const total = parseInt(summaryRow.total) || 0;
    const completed = parseInt(summaryRow.completed) || 0;
    const converted = parseInt(summaryRow.converted) || 0;
    const avgTime = summaryRow.avg_time_minutes ? parseFloat(summaryRow.avg_time_minutes) : 0;

    const summary = {
      total,
      completed,
      conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
      avgTime: Math.round(avgTime),
    };

    // 2. Funnel Query - Group by touchpoint_number
    const funnelResult = await pool.query(
      `SELECT
        t.touchpoint_number,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status IN ('Interested', 'Undecided', 'Completed')) as converted
       FROM touchpoints t
       LEFT JOIN clients c ON c.id = t.client_id
       ${whereClause}
       GROUP BY t.touchpoint_number
       ORDER BY t.touchpoint_number`,
      params
    );

    const funnel: Record<string, { total: number; converted: number; rate: number }> = {};
    for (let i = 1; i <= 7; i++) {
      funnel[`touchpoint${i}`] = { total: 0, converted: 0, rate: 0 };
    }

    for (const row of funnelResult.rows) {
      const tpNumber = row.touchpoint_number;
      const tpTotal = parseInt(row.total) || 0;
      const tpConverted = parseInt(row.converted) || 0;
      const key = `touchpoint${tpNumber}`;
      if (funnel[key]) {
        funnel[key] = {
          total: tpTotal,
          converted: tpConverted,
          rate: tpTotal > 0 ? Math.round((tpConverted / tpTotal) * 100) : 0,
        };
      }
    }

    // 3. Trends Query - Group by date
    const trendsResult = await pool.query(
      `SELECT
        t.date,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE t.status = 'Completed') as completed
       FROM touchpoints t
       LEFT JOIN clients c ON c.id = t.client_id
       ${whereClause}
       GROUP BY t.date
       ORDER BY t.date ASC`,
      params
    );

    const trends = trendsResult.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count) || 0,
      completed: parseInt(row.completed) || 0,
    }));

    // 4. Caravan Performance Query
    const caravanPerformanceResult = await pool.query(
      `SELECT
        t.user_id as caravan_id,
        u.first_name || ' ' || u.last_name as caravan_name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'Completed') as completed,
        EXTRACT(EPOCH FROM AVG(t.time_out - t.time_in)) / 60 as avg_time_minutes
       FROM touchpoints t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN clients c ON c.id = t.client_id
       ${whereClause}
       GROUP BY t.user_id, u.first_name, u.last_name
       ORDER BY completed DESC, total DESC`,
      params
    );

    const caravanPerformance = caravanPerformanceResult.rows.map(row => {
      const tpTotal = parseInt(row.total) || 0;
      const tpCompleted = parseInt(row.completed) || 0;
      const tpAvgTime = row.avg_time_minutes ? parseFloat(row.avg_time_minutes) : 0;
      return {
        caravanId: row.caravan_id,
        caravanName: row.caravan_name || 'Unknown',
        total: tpTotal,
        completed: tpCompleted,
        rate: tpTotal > 0 ? Math.round((tpCompleted / tpTotal) * 100) : 0,
        avgTime: Math.round(tpAvgTime),
      };
    });

    // 5. Status Distribution Query
    const statusDistributionResult = await pool.query(
      `SELECT
        t.status,
        COUNT(*) as count
       FROM touchpoints t
       LEFT JOIN clients c ON c.id = t.client_id
       ${whereClause}
       GROUP BY t.status
       ORDER BY count DESC`,
      params
    );

    const totalStatus = statusDistributionResult.rows.reduce(
      (sum, row) => sum + (parseInt(row.count) || 0),
      0
    );

    const statusDistribution = statusDistributionResult.rows.map(row => {
      const count = parseInt(row.count) || 0;
      return {
        status: row.status,
        count,
        percentage: totalStatus > 0 ? Math.round((count / totalStatus) * 100) : 0,
      };
    });

    return c.json({
      summary,
      funnel,
      trends,
      caravanPerformance,
      statusDistribution,
    });
  } catch (error) {
    console.error('❌ Touchpoints analytics error:', error);
    console.error('❌ Error name:', (error as any).name);
    console.error('❌ Error message:', (error as any).message);
    console.error('❌ Error stack:', (error as any).stack);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default touchpointsAnalytics;
