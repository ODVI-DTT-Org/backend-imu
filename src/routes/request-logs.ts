/**
 * Request Logs Routes
 * Provides endpoints to query and analyze HTTP request logs
 */

import { Hono } from 'hono';
import { pool } from '../db/index.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = new Hono();

// Apply authentication middleware to all routes
router.use('*', authMiddleware);

/**
 * GET /api/request-logs
 * Get paginated list of request logs with filtering
 */
router.get('/', requireRole('admin'), async (c) => {
  try {
    const {
      page = '1',
      limit = '50',
      userId,
      method,
      statusCode,
      path: pathFilter,
      startDate,
      endDate,
      errorsOnly = 'false',
    } = c.req.query();

    const parsedPage = parseInt(page, 10);
    const parsedLimit = Math.min(parseInt(limit, 10), 100); // Max 100 per page
    const offset = (parsedPage - 1) * parsedLimit;

    // Build query conditions
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (method) {
      conditions.push(`method = $${paramIndex++}`);
      params.push(method.toUpperCase());
    }

    if (statusCode) {
      conditions.push(`status_code = $${paramIndex++}`);
      params.push(parseInt(statusCode, 10));
    }

    if (pathFilter) {
      conditions.push(`path ILIKE $${paramIndex++}`);
      params.push(`%${pathFilter}%`);
    }

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(new Date(startDate));
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(new Date(endDate));
    }

    if (errorsOnly === 'true') {
      conditions.push(`status_code >= 400`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM request_logs ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get paginated results
    params.push(parsedLimit, offset);
    const result = await pool.query(
      `SELECT
        id,
        request_id,
        timestamp,
        completed_at,
        method,
        path,
        query_params,
        headers,
        body,
        ip_address,
        user_agent,
        origin,
        user_id,
        user_role,
        status_code,
        duration_ms,
        response_size,
        error_message,
        error_name,
        error_code,
        created_at
      FROM request_logs
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    return c.json({
      success: true,
      data: result.rows,
      meta: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

/**
 * GET /api/request-logs/:requestId
 * Get detailed information about a specific request
 */
router.get('/:requestId', requireRole('admin'), async (c) => {
  try {
    const { requestId } = c.req.param();

    const result = await pool.query(
      `SELECT
        id,
        request_id,
        timestamp,
        completed_at,
        method,
        path,
        query_params,
        headers,
        body,
        ip_address,
        user_agent,
        origin,
        user_id,
        user_role,
        status_code,
        duration_ms,
        response_size,
        error_message,
        error_name,
        error_code,
        created_at,
        updated_at
      FROM request_logs
      WHERE request_id = $1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Request log not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

/**
 * GET /api/request-logs/stats/summary
 * Get summary statistics of request logs
 */
router.get('/stats/summary', requireRole('admin'), async (c) => {
  try {
    const { startDate, endDate } = c.req.query();

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(new Date(startDate));
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(new Date(endDate));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get overall stats
    const statsResult = await pool.query(
      `SELECT
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
        COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) as success_count,
        COUNT(*) FILTER (WHERE status_code >= 300 AND status_code < 400) as redirect_count,
        AVG(duration_ms) as avg_duration,
        MIN(duration_ms) as min_duration,
        MAX(duration_ms) as max_duration,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_duration
      FROM request_logs
      ${whereClause}`,
      params
    );

    // Get stats by method
    const methodStatsResult = await pool.query(
      `SELECT
        method,
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration,
        COUNT(*) FILTER (WHERE status_code >= 400) as error_count
      FROM request_logs
      ${whereClause}
      GROUP BY method
      ORDER BY count DESC`,
      params
    );

    // Get stats by status code
    const statusStatsResult = await pool.query(
      `SELECT
        status_code,
        COUNT(*) as count
      FROM request_logs
      ${whereClause}
      GROUP BY status_code
      ORDER BY count DESC
      LIMIT 20`,
      params
    );

    // Get top paths by request count
    const topPathsResult = await pool.query(
      `SELECT
        path,
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration,
        COUNT(*) FILTER (WHERE status_code >= 400) as error_count
      FROM request_logs
      ${whereClause}
      GROUP BY path
      ORDER BY count DESC
      LIMIT 20`,
      params
    );

    // Get top errors by count
    const topErrorsResult = await pool.query(
      `SELECT
        error_name,
        error_message,
        COUNT(*) as count
      FROM request_logs
      WHERE status_code >= 400
        ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      GROUP BY error_name, error_message
      ORDER BY count DESC
      LIMIT 10`,
      params
    );

    return c.json({
      success: true,
      data: {
        overall: statsResult.rows[0],
        byMethod: methodStatsResult.rows,
        byStatusCode: statusStatsResult.rows,
        topPaths: topPathsResult.rows,
        topErrors: topErrorsResult.rows,
      },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

/**
 * DELETE /api/request-logs
 * Delete old request logs (admin only)
 */
router.delete('/', requireRole('admin'), async (c) => {
  try {
    const { beforeDate, daysOld = '30' } = c.req.query();

    let deleteBeforeDate: Date;

    if (beforeDate) {
      deleteBeforeDate = new Date(beforeDate);
    } else {
      const days = parseInt(daysOld, 10);
      deleteBeforeDate = new Date();
      deleteBeforeDate.setDate(deleteBeforeDate.getDate() - days);
    }

    const result = await pool.query(
      `DELETE FROM request_logs WHERE timestamp < $1`,
      [deleteBeforeDate]
    );

    return c.json({
      success: true,
      message: `Deleted ${result.rowCount} request logs`,
      deletedCount: result.rowCount,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

export default router;
