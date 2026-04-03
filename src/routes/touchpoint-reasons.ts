import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../errors/index.js';

const touchpointReasons = new Hono();

// GET /api/touchpoint-reasons - Get touchpoint reasons filtered by role and touchpoint type
touchpointReasons.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const role = c.req.query('role'); // caravan or tele
    const touchpointType = c.req.query('touchpoint_type'); // Visit or Call

    // Build query conditions
    const conditions: string[] = ['is_active = true'];
    const params: any[] = [];

    // Filter by role if specified
    if (role) {
      conditions.push('role = $1');
      params.push(role);
    }

    // Filter by touchpoint type if specified
    if (touchpointType) {
      const paramIndex = params.length + 1;
      conditions.push(`touchpoint_type = $${paramIndex}`);
      params.push(touchpointType);
    }

    const query = `
      SELECT
        id,
        reason_code,
        label,
        touchpoint_type,
        role,
        category,
        sort_order
      FROM touchpoint_reasons
      WHERE ${conditions.join(' AND ')}
      ORDER BY role, touchpoint_type, category, sort_order
    `;

    const result = await pool.query(query, params);

    // Group by category for easier frontend consumption
    const grouped: Record<string, any[]> = {};
    const flat: any[] = [];

    result.rows.forEach(row => {
      const item = {
        id: row.id,
        value: row.reason_code,
        label: row.label,
        touchpoint_type: row.touchpoint_type,
        role: row.role,
        category: row.category || 'Other',
        sort_order: row.sort_order
      };

      flat.push(item);

      if (!grouped[row.category || 'Other']) {
        grouped[row.category || 'Other'] = [];
      }
      grouped[row.category || 'Other'].push(item);
    });

    return c.json({
      items: flat,
      grouped,
      total: flat.length
    });
  } catch (error) {
    console.error('Fetch touchpoint reasons error:', error);
    throw new Error();
  }
});

// POST /api/touchpoint-reasons - Create new touchpoint reason (admin only)
touchpointReasons.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');

    // Only admin can create touchpoint reasons
    if (user.role !== 'admin') {
      throw new AuthorizationError('Only admin can create touchpoint reasons');
    }

    const body = await c.req.json();
    const { code, label, touchpoint_type, role, category, sort_order = 0, color = '#6B7280' } = body;

    // Validation
    if (!code || !label || !touchpoint_type || !role) {
      throw new ValidationError('Missing required fields: code, label, touchpoint_type, role');
    }

    if (!['Visit', 'Call'].includes(touchpoint_type)) {
      return c.json({ message: 'touchpoint_type must be Visit or Call' }, 400);
    }

    if (!['caravan', 'tele'].includes(role)) {
      return c.json({ message: 'role must be caravan or tele' }, 400);
    }

    const result = await pool.query(
      `INSERT INTO touchpoint_reasons (code, label, touchpoint_type, role, category, sort_order, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, code, label, touchpoint_type, role, category, sort_order, color`,
      [code, label, touchpoint_type, role, category || null, sort_order, color]
    );

    return c.json(result.rows[0], 201);
  } catch (error: any) {
    console.error('Create touchpoint reason error:', error);

    // Check for unique constraint violation
    if (error.code === '23505') {
      throw new ConflictError('Touchpoint reason with this code already exists');
    }

    throw new Error();
  }
});

// PUT /api/touchpoint-reasons/:id - Update touchpoint reason (admin only)
touchpointReasons.put('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');

    // Only admin can update touchpoint reasons
    if (user.role !== 'admin') {
      throw new AuthorizationError('Only admin can update touchpoint reasons');
    }

    const id = c.req.param('id');
    const body = await c.req.json();
    const { code, label, touchpoint_type, role, category, sort_order, color, is_active } = body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (code !== undefined) {
      updates.push(`code = $${paramIndex++}`);
      params.push(code);
    }
    if (label !== undefined) {
      updates.push(`label = $${paramIndex++}`);
      params.push(label);
    }
    if (touchpoint_type !== undefined) {
      if (!['Visit', 'Call'].includes(touchpoint_type)) {
        throw new ValidationError('touchpoint_type must be Visit or Call');
      }
      updates.push(`touchpoint_type = $${paramIndex++}`);
      params.push(touchpoint_type);
    }
    if (role !== undefined) {
      if (!['caravan', 'tele'].includes(role)) {
        throw new ValidationError('role must be caravan or tele');
      }
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      params.push(category);
    }
    if (sort_order !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      params.push(sort_order);
    }
    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      params.push(color);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    params.push(id); // Add id as the last parameter

    const result = await pool.query(
      `UPDATE touchpoint_reasons
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, code, label, touchpoint_type, role, category, sort_order, color, is_active`,
      params
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Touchpoint reason');
    }

    return c.json(result.rows[0]);
  } catch (error: any) {
    console.error('Update touchpoint reason error:', error);

    if (error.code === '23505') {
      throw new ConflictError('Touchpoint reason with this code already exists');
    }

    throw new Error();
  }
});

// DELETE /api/touchpoint-reasons/:id - Delete touchpoint reason (admin only)
touchpointReasons.delete('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');

    // Only admin can delete touchpoint reasons
    if (user.role !== 'admin') {
      throw new AuthorizationError('Only admin can delete touchpoint reasons');
    }

    const id = c.req.param('id');

    const result = await pool.query(
      `DELETE FROM touchpoint_reasons WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Touchpoint reason');
    }

    return c.json({ message: 'Touchpoint reason deleted successfully' });
  } catch (error) {
    console.error('Delete touchpoint reason error:', error);
    throw new Error();
  }
});

export default touchpointReasons;
