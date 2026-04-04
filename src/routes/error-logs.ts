/**
 * Error Logs Admin Routes
 *
 * Admin endpoints for viewing, filtering, and resolving error logs.
 */

import { Hono } from 'hono';
import { pool } from '../db/index.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { errorLogger } from '../services/errorLogger.js';
import { apiRateLimit } from '../middleware/rate-limit.js';

const errorLogs = new Hono();

// Apply authentication middleware to all routes
errorLogs.use('*', authMiddleware);

// Apply rate limiting to all error logs routes (100 requests per minute)
errorLogs.use('*', apiRateLimit);

// Require admin or manager role for error log access
errorLogs.use('*', requireRole('admin', 'area_manager', 'assistant_area_manager'));

/**
 * GET /api/error-logs
 * List error logs with filtering and pagination
 */
errorLogs.get('/', requirePermission('error_logs', 'read'), async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const code = c.req.query('code');
    const resolved = c.req.query('resolved');
    const userId = c.req.query('userId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const filters: any = { limit, offset };

    if (code) filters.code = code;
    if (resolved !== undefined) filters.resolved = resolved === 'true';
    if (userId) filters.userId = userId;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    const logs = await errorLogger.getErrorLogs(filters);

    return c.json({
      success: true,
      data: logs,
      meta: {
        limit,
        offset,
        count: logs.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching error logs:', error);
    return c.json(
      {
        success: false,
        message: 'Failed to fetch error logs',
        error: error.message,
      },
      500
    );
  }
});

/**
 * GET /api/error-logs/stats
 * Get error statistics
 */
errorLogs.get('/stats', requirePermission('error_logs', 'read'), async (c) => {
  try {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    if (!startDate || !endDate) {
      return c.json(
        {
          success: false,
          message: 'startDate and endDate query parameters are required',
        },
        400
      );
    }

    const stats = await errorLogger.getErrorStats(
      new Date(startDate),
      new Date(endDate)
    );

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Error fetching error stats:', error);
    return c.json(
      {
        success: false,
        message: 'Failed to fetch error stats',
        error: error.message,
      },
      500
    );
  }
});

/**
 * GET /api/error-logs/:requestId
 * Get error log by request ID
 */
errorLogs.get('/:requestId', requirePermission('error_logs', 'read'), async (c) => {
  try {
    const requestId = c.req.param('requestId');

    if (!requestId) {
      return c.json({
        success: false,
        message: 'Request ID is required',
      }, 400);
    }

    const log = await errorLogger.getErrorLogByRequestId(requestId);

    if (!log) {
      return c.json(
        {
          success: false,
          message: 'Error log not found',
        },
        404
      );
    }

    return c.json({
      success: true,
      data: log,
    });
  } catch (error: any) {
    console.error('Error fetching error log:', error);
    return c.json(
      {
        success: false,
        message: 'Failed to fetch error log',
        error: error.message,
      },
      500
    );
  }
});

/**
 * POST /api/error-logs/:id/resolve
 * Resolve an error log
 */
errorLogs.post('/:id/resolve', requirePermission('error_logs', 'update'), async (c) => {
  try {
    const id = c.req.param('id');

    if (!id) {
      return c.json({
        success: false,
        message: 'Error log ID is required',
      }, 400);
    }

    const user = c.get('user');
    const userId = user?.sub as string;

    const body = await c.req.json();
    const { notes } = body;

    const success = await errorLogger.resolveErrorLog(id, userId, notes);

    if (!success) {
      return c.json(
        {
          success: false,
          message: 'Failed to resolve error log',
        },
        500
      );
    }

    return c.json({
      success: true,
      message: 'Error log resolved',
    });
  } catch (error: any) {
    console.error('Error resolving error log:', error);
    return c.json(
      {
        success: false,
        message: 'Failed to resolve error log',
        error: error.message,
      },
      500
    );
  }
});

export default errorLogs;
