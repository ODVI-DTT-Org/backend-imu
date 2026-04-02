import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../errors/index.js';

const targets = new Hono();

const createTargetSchema = z.object({
  user_id: z.string().uuid(),
  period: z.enum(['daily', 'weekly', 'monthly']),
  year: z.number().int().min(2020).max(2030),
  month: z.number().int().min(1).max(12).optional(),
  week: z.number().int().min(1).max(53).optional(),
  target_clients: z.number().int().min(0).optional(),
  target_touchpoints: z.number().int().min(0).optional(),
  target_visits: z.number().int().min(0).optional(),
});

const updateTargetSchema = createTargetSchema.partial().omit({ user_id: true });

// GET /api/targets - Get targets for a period
targets.get('/', authMiddleware, requirePermission('targets', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const period = c.req.query('period') || 'monthly';
    const year = parseInt(c.req.query('year') || new Date().getFullYear().toString());
    const month = c.req.query('month') ? parseInt(c.req.query('month')!) : undefined;

    // Field agents can only see their own targets
    let userId = c.req.query('user_id');
    if (user.role === 'field_agent') {
      userId = user.sub;
    }

    const conditions: string[] = ['period = $1', 'year = $2'];
    const params: any[] = [period, year];

    if (userId) {
      conditions.push('user_id = $3');
      params.push(userId);
    }
    if (month) {
      conditions.push('month = $4');
      params.push(month);
    }

    const result = await pool.query(
      `SELECT t.*, u.first_name, u.last_name FROM targets t
       JOIN users u ON u.id = t.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC`,
      params
    );

    return c.json({
      items: result.rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        user_name: `${row.first_name} ${row.last_name}`,
        period: row.period,
        year: row.year,
        month: row.month,
        week: row.week,
        target_clients: row.target_clients,
        target_touchpoints: row.target_touchpoints,
        target_visits: row.target_visits,
        created: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Get targets error:', error);
    throw new Error();
  }
});

// GET /api/targets/current - Get current month targets
targets.get('/current', authMiddleware, requirePermission('targets', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    let userId: string = user.sub;
    const queryUserId = c.req.query('user_id');
    if (user.role !== 'field_agent' && queryUserId) {
      userId = queryUserId;
    }

    const result = await pool.query(
      `SELECT t.*, u.first_name, u.last_name FROM targets t
       JOIN users u ON u.id = t.user_id
       WHERE t.user_id = $1 AND t.period = 'monthly' AND t.year = $2 AND t.month = $3`,
      [userId, year, month]
    );

    // Get actual progress
    const progressResult = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM clients WHERE user_id = $1 AND EXTRACT(MONTH FROM created_at) = $2 AND EXTRACT(YEAR FROM created_at) = $3) as actual_clients,
        (SELECT COUNT(*) FROM touchpoints WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3) as actual_touchpoints,
        (SELECT COUNT(*) FROM touchpoints WHERE user_id = $1 AND type = 'Visit' AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3) as actual_visits`,
      [userId, month, year]
    );

    const progress = progressResult.rows[0];

    if (result.rows.length === 0) {
      return c.json({
        target: null,
        progress: {
          actual_clients: parseInt(progress.actual_clients),
          actual_touchpoints: parseInt(progress.actual_touchpoints),
          actual_visits: parseInt(progress.actual_visits),
        },
        month, year,
      });
    }

    const target = result.rows[0];
    return c.json({
      target: {
        id: target.id,
        user_id: target.user_id,
        user_name: `${target.first_name} ${target.last_name}`,
        period: target.period,
        year: target.year,
        month: target.month,
        target_clients: target.target_clients,
        target_touchpoints: target.target_touchpoints,
        target_visits: target.target_visits,
      },
      progress: {
        actual_clients: parseInt(progress.actual_clients),
        actual_touchpoints: parseInt(progress.actual_touchpoints),
        actual_visits: parseInt(progress.actual_visits),
        client_progress: target.target_clients > 0
          ? Math.round((parseInt(progress.actual_clients) / target.target_clients) * 100) : 0,
        touchpoint_progress: target.target_touchpoints > 0
          ? Math.round((parseInt(progress.actual_touchpoints) / target.target_touchpoints) * 100) : 0,
        visit_progress: target.target_visits > 0
          ? Math.round((parseInt(progress.actual_visits) / target.target_visits) * 100) : 0,
      },
      month, year,
    });
  } catch (error) {
    console.error('Get current targets error:', error);
    throw new Error();
  }
});

// GET /api/targets/history - Get target history
targets.get('/history', authMiddleware, requirePermission('targets', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit') || '12');

    let userId: string = user.sub;
    const queryUserId = c.req.query('user_id');
    if (user.role !== 'field_agent' && queryUserId) {
      userId = queryUserId;
    }

    const result = await pool.query(
      `SELECT t.*, u.first_name, u.last_name FROM targets t
       JOIN users u ON u.id = t.user_id
       WHERE t.user_id = $1 AND t.period = 'monthly'
       ORDER BY t.year DESC, t.month DESC
       LIMIT $2`,
      [userId, limit]
    );

    return c.json({
      items: result.rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        user_name: `${row.first_name} ${row.last_name}`,
        period: row.period,
        year: row.year,
        month: row.month,
        target_clients: row.target_clients,
        target_touchpoints: row.target_touchpoints,
        target_visits: row.target_visits,
        created: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Get target history error:', error);
    throw new Error();
  }
});

// POST /api/targets - Create/update targets (admin only)
targets.post('/', authMiddleware, requirePermission('targets', 'create'), auditMiddleware('target'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createTargetSchema.parse(body);

    // Only admin/staff can create targets for others
    if (user.role === 'field_agent' && validated.user_id !== user.sub) {
      throw new AuthorizationError('Cannot create targets for other users');
    }

    // Upsert target
    const result = await pool.query(
      `INSERT INTO targets (id, user_id, period, year, month, week, target_clients, target_touchpoints, target_visits)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, period, year, COALESCE(month, 0), COALESCE(week, 0))
       DO UPDATE SET target_clients = $6, target_touchpoints = $7, target_visits = $8, created_at = NOW()
       RETURNING *`,
      [validated.user_id, validated.period, validated.year, validated.month, validated.week,
       validated.target_clients || 0, validated.target_touchpoints || 0, validated.target_visits || 0]
    );

    return c.json({
      id: result.rows[0].id,
      user_id: result.rows[0].user_id,
      period: result.rows[0].period,
      year: result.rows[0].year,
      month: result.rows[0].month,
      week: result.rows[0].week,
      target_clients: result.rows[0].target_clients,
      target_touchpoints: result.rows[0].target_touchpoints,
      target_visits: result.rows[0].target_visits,
      created: result.rows[0].created_at,
    }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Create target error:', error);
    throw new Error('Failed to create target');
  }
});

// DELETE /api/targets/:id - Delete a target
targets.delete('/:id', authMiddleware, requirePermission('targets', 'delete'), auditMiddleware('target'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    // Check if target exists
    const existing = await pool.query(
      'SELECT * FROM targets WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Target');
    }

    // Field agents can only delete their own targets
    if (user.role === 'field_agent' && existing.rows[0].user_id !== user.sub) {
      throw new AuthorizationError('Cannot delete targets for other users');
    }

    await pool.query('DELETE FROM targets WHERE id = $1', [id]);

    return c.json({ message: 'Target deleted successfully' });
  } catch (error) {
    console.error('Delete target error:', error);
    throw new Error();
  }
});

export default targets;
