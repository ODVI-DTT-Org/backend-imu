import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';

const dashboard = new Hono();

// Helper function to get local date string (not UTC)
function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// GET /api/dashboard - Get dashboard statistics
dashboard.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');

    // Default to current month if no dates provided
    const now = new Date();
    const monthStart = startDate || getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = endDate || getLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    // Build role-based filter
    const caravanFilter = user.role === 'field_agent' ? 'AND caravan_id = $3' : '';
    const caravanParams = user.role === 'field_agent' ? [user.sub] : [];

    // Get client statistics
    const clientStats = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE client_type = 'POTENTIAL') as potential_clients,
        COUNT(*) FILTER (WHERE client_type = 'EXISTING') as existing_clients,
        COUNT(*) as total_clients
       FROM clients
       WHERE 1=1 ${user.role === 'field_agent' ? 'AND user_id = $1' : ''}`,
      caravanParams
    );

    // Get touchpoint statistics for the period
    const touchpointStats = await pool.query(
      `SELECT
        COUNT(*) as total_touchpoints,
        COUNT(*) FILTER (WHERE type = 'Visit') as visits,
        COUNT(*) FILTER (WHERE type = 'Call') as calls
       FROM touchpoints
       WHERE date >= $1 AND date <= $2 ${caravanFilter}`,
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
       WHERE scheduled_date >= $1 AND scheduled_date <= $2 ${caravanFilter}`,
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
       JOIN clients c ON c.id = t.client_id
       WHERE t.created_at >= NOW() - INTERVAL '7 days' ${caravanFilter.replace('caravan_id', 't.user_id')}
       UNION ALL
       SELECT
        'itinerary' as type, i.id, i.created_at as date,
        c.first_name || ' ' || c.last_name as client_name
       FROM itineraries i
       JOIN clients c ON c.id = i.client_id
       WHERE i.created_at >= NOW() - INTERVAL '7 days' ${caravanFilter.replace('caravan_id', 'i.user_id')}
       ORDER BY date DESC
       LIMIT 10`,
      user.role === 'field_agent' ? [user.sub, user.sub] : []
    );

    // Get clients by agency breakdown
    const clientsByAgency = await pool.query(
      `SELECT a.name as agency_name, COUNT(c.id) as client_count
       FROM clients c
       LEFT JOIN agencies a ON a.id = c.agency_id
       ${user.role === 'field_agent' ? 'WHERE c.user_id = $1' : ''}
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
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// GET /api/dashboard/performance - Get performance metrics
dashboard.get('/performance', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const caravanId = c.req.query('caravan_id') || (user.role === 'field_agent' ? user.sub : null);

    if (!caravanId) {
      return c.json({ message: 'Caravan ID required' }, 400);
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
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default dashboard;
