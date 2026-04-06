/**
 * Dashboard Routes
 *
 * HTTP routes for dashboard endpoints with optimized queries
 *
 * @file dashboard-new.ts
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
} from '../errors/index.js';
import {
  getTargetProgress,
  getTeamPerformance,
  getActionItems,
  refreshActionItems,
  getActionItemsLastRefresh,
} from './dashboard-endpoints.js';

const dashboard = new Hono();

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

export default dashboard;
