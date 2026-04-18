import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';

const teles = new Hono();

const TELE_ROLES = ['tele'] as const;

function mapRowToTele(row: Record<string, any>) {
  const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
  return {
    id: row.id,
    name: fullName || row.email,
    email: row.email,
    phone: row.phone || '',
    status: row.is_active ? 'active' : 'inactive',
    first_name: row.first_name,
    last_name: row.last_name,
    middle_name: row.middle_name,
    created: row.created_at,
    updated: row.updated_at,
  };
}

// GET /api/teles - List all tele agents
teles.get('/', authMiddleware, requirePermission('teles', 'read'), async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '20');
    const search = c.req.query('search');
    const status = c.req.query('status');

    const offset = (page - 1) * perPage;
    const conditions: string[] = ["role = ANY($1)"];
    const params: any[] = [TELE_ROLES];
    let paramIndex = 2;

    if (search) {
      conditions.push(`(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status && status !== 'all') {
      conditions.push(`is_active = $${paramIndex}`);
      params.push(status === 'active');
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, middle_name, phone, is_active, created_at, updated_at
       FROM users
       ${whereClause}
       ORDER BY last_name ASC, first_name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    return c.json({
      items: result.rows.map(mapRowToTele),
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('Fetch teles error:', error);
    throw new Error();
  }
});

// GET /api/teles/:id - Get single tele agent
teles.get('/:id', authMiddleware, requirePermission('teles', 'read'), async (c) => {
  try {
    const id = c.req.param('id');

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, middle_name, phone, is_active, created_at, updated_at
       FROM users
       WHERE id = $1 AND role = ANY($2)`,
      [id, TELE_ROLES]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Tele agent');
    }

    return c.json(mapRowToTele(result.rows[0]));
  } catch (error) {
    console.error('Fetch tele error:', error);
    throw new Error();
  }
});

export default teles;
