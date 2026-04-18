import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { callService, createCallSchema, updateCallSchema } from '../services/call.service.js';
import { ValidationError } from '../errors/index.js';
import { pool } from '../db/index.js';

const calls = new Hono();

// Builds the all_calls CTE query string and param array for admin endpoints.
// Includes:
//   - All records from the calls table (web touchpoint calls + call-only records)
//   - Touchpoints of type='Call' with no call_id (mobile call touchpoints with no call record)
function buildAdminCallsQuery(q: Record<string, string>) {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (q.search) {
    conditions.push(`(r.client_name ILIKE $${idx})`);
    params.push(`%${q.search}%`);
    idx++;
  }
  if (q.date_from) {
    conditions.push(`r.dial_time >= $${idx}`);
    params.push(q.date_from);
    idx++;
  }
  if (q.date_to) {
    conditions.push(`r.dial_time <= $${idx}`);
    params.push(q.date_to);
    idx++;
  }
  if (q.status && q.status !== 'all') {
    conditions.push(`r.status = $${idx}`);
    params.push(q.status);
    idx++;
  }
  if (q.agent_id && q.agent_id !== 'all') {
    const agentIds = Array.isArray(q.agent_id) ? q.agent_id : [q.agent_id];
    conditions.push(`r.agent_id = ANY($${idx})`);
    params.push(agentIds);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // CTE combines both sources
  const cte = `
    WITH all_calls AS (
      -- Records from calls table (web touchpoint calls + call-only)
      SELECT
        ca.id,
        ca.client_id,
        (cl.first_name || ' ' || cl.last_name) AS client_name,
        ca.phone_number,
        COALESCE(ca.dial_time, ca.created_at) AS dial_time,
        ca.duration,
        tp.touchpoint_number,
        CASE WHEN tp.id IS NOT NULL THEN 'touchpoint' ELSE 'call_only' END AS call_source,
        ca.user_id AS agent_id,
        (u.first_name || ' ' || u.last_name) AS agent_name,
        ca.status,
        ca.notes,
        ca.reason,
        ca.created_at
      FROM calls ca
      JOIN clients cl ON cl.id = ca.client_id
      JOIN users u ON u.id = ca.user_id
      LEFT JOIN touchpoints tp ON tp.call_id = ca.id

      UNION ALL

      -- Mobile call touchpoints with no linked call record
      SELECT
        tp.id,
        tp.client_id,
        (cl.first_name || ' ' || cl.last_name) AS client_name,
        NULL AS phone_number,
        COALESCE(tp.date::timestamptz, tp.created_at) AS dial_time,
        NULL AS duration,
        tp.touchpoint_number,
        'touchpoint' AS call_source,
        tp.user_id AS agent_id,
        (u.first_name || ' ' || u.last_name) AS agent_name,
        tp.status,
        tp.notes,
        tp.rejection_reason AS reason,
        tp.created_at
      FROM touchpoints tp
      JOIN clients cl ON cl.id = tp.client_id
      JOIN users u ON u.id = tp.user_id
      WHERE tp.type = 'Call'
        AND tp.call_id IS NULL
    )
  `;

  return { cte, where, params, idx };
}

// Admin: paginated calls list (all sources)
calls.get('/admin', authMiddleware, requireRole('admin'), async (c) => {
  const dbClient = await pool.connect();
  try {
    const q = c.req.query();
    const page = Math.max(1, parseInt(q.page || '1'));
    const perPage = Math.min(100, Math.max(1, parseInt(q.per_page || '20')));
    const offset = (page - 1) * perPage;

    const { cte, where, params, idx } = buildAdminCallsQuery(q);

    const countResult = await dbClient.query(
      `${cte} SELECT COUNT(*) FROM all_calls r ${where}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / perPage);

    const dataResult = await dbClient.query(
      `${cte}
       SELECT r.*
       FROM all_calls r
       ${where}
       ORDER BY r.dial_time DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, perPage, offset]
    );

    return c.json({ items: dataResult.rows, page, perPage, totalItems, totalPages });
  } finally {
    dbClient.release();
  }
});

// Admin: CSV export (all sources)
calls.get('/admin/export', authMiddleware, requireRole('admin'), async (c) => {
  const dbClient = await pool.connect();
  try {
    const q = c.req.query();
    const { cte, where, params } = buildAdminCallsQuery(q);

    const result = await dbClient.query(
      `${cte}
       SELECT
         r.client_name AS "Client Name",
         COALESCE(r.phone_number, '') AS "Phone Number",
         TO_CHAR(r.dial_time, 'YYYY-MM-DD HH24:MI') AS "Dial Time",
         COALESCE(r.duration::text, '') AS "Duration (s)",
         COALESCE(r.touchpoint_number::text, '') AS "Touchpoint #",
         r.call_source AS "Call Source",
         r.agent_name AS "Agent",
         COALESCE(r.status, '') AS "Status",
         COALESCE(r.reason, '') AS "Reason",
         COALESCE(r.notes, '') AS "Notes"
       FROM all_calls r
       ${where}
       ORDER BY r.dial_time DESC`,
      params
    );

    const headers = ['Client Name', 'Phone Number', 'Dial Time', 'Duration (s)', 'Touchpoint #', 'Call Source', 'Agent', 'Status', 'Reason', 'Notes'];
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
    dbClient.release();
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
