import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { callService, createCallSchema, updateCallSchema } from '../services/call.service.js';
import { ValidationError } from '../errors/index.js';
import { pool } from '../db/index.js';

const calls = new Hono();

// Admin: paginated calls list with full JOINs
calls.get('/admin', authMiddleware, requireRole('admin'), async (c) => {
  const client = await pool.connect();
  try {
    const q = c.req.query();
    const page = Math.max(1, parseInt(q.page || '1'));
    const perPage = Math.min(100, Math.max(1, parseInt(q.per_page || '20')));
    const offset = (page - 1) * perPage;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (q.search) {
      conditions.push(`(cl.first_name ILIKE $${idx} OR cl.last_name ILIKE $${idx} OR cl.middle_name ILIKE $${idx})`);
      params.push(`%${q.search}%`);
      idx++;
    }
    if (q.date_from) {
      conditions.push(`COALESCE(ca.dial_time, ca.created_at) >= $${idx}`);
      params.push(q.date_from);
      idx++;
    }
    if (q.date_to) {
      conditions.push(`COALESCE(ca.dial_time, ca.created_at) <= $${idx}`);
      params.push(q.date_to);
      idx++;
    }
    if (q.status && q.status !== 'all') {
      conditions.push(`ca.status = $${idx}`);
      params.push(q.status);
      idx++;
    }
    if (q.agent_id && q.agent_id !== 'all') {
      const agentIds = Array.isArray(q.agent_id) ? q.agent_id : [q.agent_id];
      conditions.push(`ca.user_id = ANY($${idx})`);
      params.push(agentIds);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseQuery = `
      FROM calls ca
      JOIN clients cl ON cl.id = ca.client_id
      JOIN users u ON u.id = ca.user_id
      ${where}
    `;

    const countResult = await client.query(`SELECT COUNT(*) ${baseQuery}`, params);
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / perPage);

    const dataResult = await client.query(`
      SELECT
        ca.id,
        ca.client_id,
        (cl.first_name || ' ' || cl.last_name) AS client_name,
        ca.phone_number,
        ca.dial_time,
        ca.duration,
        ca.user_id AS agent_id,
        (u.first_name || ' ' || u.last_name) AS agent_name,
        ca.status,
        ca.reason,
        ca.notes,
        ca.created_at
      ${baseQuery}
      ORDER BY COALESCE(ca.dial_time, ca.created_at) DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, perPage, offset]);

    return c.json({
      items: dataResult.rows,
      page,
      perPage,
      totalItems,
      totalPages,
    });
  } finally {
    client.release();
  }
});

// Admin: CSV export
calls.get('/admin/export', authMiddleware, requireRole('admin'), async (c) => {
  const client = await pool.connect();
  try {
    const q = c.req.query();

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (q.search) {
      conditions.push(`(cl.first_name ILIKE $${idx} OR cl.last_name ILIKE $${idx} OR cl.middle_name ILIKE $${idx})`);
      params.push(`%${q.search}%`);
      idx++;
    }
    if (q.date_from) {
      conditions.push(`COALESCE(ca.dial_time, ca.created_at) >= $${idx}`);
      params.push(q.date_from);
      idx++;
    }
    if (q.date_to) {
      conditions.push(`COALESCE(ca.dial_time, ca.created_at) <= $${idx}`);
      params.push(q.date_to);
      idx++;
    }
    if (q.status && q.status !== 'all') {
      conditions.push(`ca.status = $${idx}`);
      params.push(q.status);
      idx++;
    }
    if (q.agent_id && q.agent_id !== 'all') {
      const agentIds = Array.isArray(q.agent_id) ? q.agent_id : [q.agent_id];
      conditions.push(`ca.user_id = ANY($${idx})`);
      params.push(agentIds);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.query(`
      SELECT
        (cl.first_name || ' ' || cl.last_name) AS "Client Name",
        ca.phone_number AS "Phone Number",
        TO_CHAR(COALESCE(ca.dial_time, ca.created_at), 'YYYY-MM-DD HH24:MI') AS "Dial Time",
        COALESCE(ca.duration::text, '') AS "Duration (s)",
        (u.first_name || ' ' || u.last_name) AS "Agent",
        COALESCE(ca.status, '') AS "Status",
        COALESCE(ca.reason, '') AS "Reason",
        COALESCE(ca.notes, '') AS "Notes"
      FROM calls ca
      JOIN clients cl ON cl.id = ca.client_id
      JOIN users u ON u.id = ca.user_id
      ${where}
      ORDER BY COALESCE(ca.dial_time, ca.created_at) DESC
    `, params);

    const headers = ['Client Name', 'Phone Number', 'Dial Time', 'Duration (s)', 'Agent', 'Status', 'Reason', 'Notes'];
    const csvRows = [
      headers.join(','),
      ...result.rows.map((row: any) =>
        headers.map(h => {
          const val = String(row[h] ?? '');
          return val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        }).join(',')
      )
    ];

    const filename = `calls-export-${new Date().toISOString().slice(0, 10)}.csv`;
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.text(csvRows.join('\n'));
  } finally {
    client.release();
  }
});

// Get all calls (with filters)
calls.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const filters = c.req.query();
  let result;
  if (filters.client_id) {
    result = await callService.findByClientId(filters.client_id, filters);
  } else {
    result = await callService.findAll(user.sub, filters);
  }
  return c.json(result);
});

// Get call by ID
calls.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const call = await callService.findById(id);
  if (!call) return c.json({ error: 'Call not found' }, 404);
  return c.json(call);
});

// Create call
calls.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const data = await c.req.json();
    const call = await callService.create({ ...data, user_id: user.sub });
    return c.json(call, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    throw error;
  }
});

// Update call
calls.patch('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Invalid ID' }, 400);
    const data = await c.req.json();
    const call = await callService.update(id, data);
    if (!call) return c.json({ error: 'Call not found' }, 404);
    return c.json(call);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    throw error;
  }
});

// Delete call
calls.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  await callService.delete(id);
  return c.json({ success: true });
});

export default calls;
