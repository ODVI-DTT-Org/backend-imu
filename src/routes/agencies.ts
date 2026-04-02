import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole, requireAnyRole } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../errors/index.js';

const agencies = new Hono();

// Validation schemas
const createAgencySchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  address: z.string().optional(),
});

const updateAgencySchema = createAgencySchema.partial();

// Helper to map DB row to Agency type
function mapRowToAgency(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    region: row.region || '',
    status: row.status || 'active',
    created: row.created_at,
  };
}

// GET /api/agencies - List all agencies
agencies.get('/', authMiddleware, async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '50');
    const search = c.req.query('search');

    const offset = (page - 1) * perPage;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR code ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM agencies ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results
    const result = await pool.query(
      `SELECT * FROM agencies ${whereClause}
       ORDER BY name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    return c.json({
      items: result.rows.map(mapRowToAgency),
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('Fetch agencies error:', error);
    throw new Error();
  }
});

// GET /api/agencies/:id - Get single agency
agencies.get('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');

    const result = await pool.query('SELECT * FROM agencies WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Agency');
    }

    return c.json(mapRowToAgency(result.rows[0]));
  } catch (error) {
    console.error('Fetch agency error:', error);
    throw new Error();
  }
});

// POST /api/agencies - Create new agency (admin/staff only)
agencies.post('/', authMiddleware, requireAnyRole('admin', 'staff'), auditMiddleware('agency'), async (c) => {
  try {
    const body = await c.req.json();
    const validated = createAgencySchema.parse(body);

    const result = await pool.query(
      `INSERT INTO agencies (id, name, code, address)
       VALUES (gen_random_uuid(), $1, $2, $3)
       RETURNING *`,
      [validated.name, validated.code, validated.address]
    );

    return c.json(mapRowToAgency(result.rows[0]), 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    if (error.code === '23505') {
      throw new ConflictError('Agency code already exists');
    }
    console.error('Create agency error:', error);
    throw new Error('Failed to create agency');
  }
});

// PUT /api/agencies/:id - Update agency (admin/staff only)
agencies.put('/:id', authMiddleware, requireAnyRole('admin', 'staff'), auditMiddleware('agency'), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = updateAgencySchema.parse(body);

    // Check if agency exists
    const existing = await pool.query('SELECT * FROM agencies WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new NotFoundError('Agency');
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(validated)) {
      if (value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        updateValues.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updateValues.push(id);
    const result = await pool.query(
      `UPDATE agencies SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    return c.json(mapRowToAgency(result.rows[0]));
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    if (error.code === '23505') {
      throw new ConflictError('Agency code already exists');
    }
    console.error('Update agency error:', error);
    throw new Error('Failed to update agency');
  }
});

// DELETE /api/agencies/:id - Delete agency (admin only)
agencies.delete('/:id', authMiddleware, requireRole('admin'), auditMiddleware('agency'), async (c) => {
  try {
    const id = c.req.param('id');

    const result = await pool.query('DELETE FROM agencies WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Agency');
    }

    return c.json({ message: 'Agency deleted successfully' });
  } catch (error: any) {
    if (error.code === '23503') {
      throw new ValidationError('Cannot delete agency with associated clients');
    }
    console.error('Delete agency error:', error);
    throw new Error();
  }
});

export default agencies;
