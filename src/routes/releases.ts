import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { releaseService, createReleaseSchema, updateReleaseSchema } from '../services/release.service.js';
import { ValidationError } from '../errors/index.js';
import { pool } from '../db/index.js';

const releases = new Hono();

// Admin: paginated releases list
releases.get('/admin', authMiddleware, requireRole('admin'), async (c) => {
  const dbClient = await pool.connect();
  try {
    const q = c.req.query();
    const page = Math.max(1, parseInt(q.page || '1'));
    const perPage = Math.min(100, Math.max(1, parseInt(q.per_page || '20')));
    const offset = (page - 1) * perPage;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (q.search) {
      conditions.push(`(cl.first_name || ' ' || cl.last_name) ILIKE $${idx}`);
      params.push(`%${q.search}%`);
      idx++;
    }
    if (q.status) {
      conditions.push(`r.status = $${idx}`);
      params.push(q.status);
      idx++;
    }
    if (q.agent_id) {
      conditions.push(`r.user_id = $${idx}`);
      params.push(q.agent_id);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseQuery = `
      FROM releases r
      JOIN clients cl ON cl.id = r.client_id
      JOIN users u ON u.id = r.user_id
      ${where}
    `;

    const countResult = await dbClient.query(
      `SELECT COUNT(*) ${baseQuery}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / perPage);

    const dataResult = await dbClient.query(
      `SELECT
         r.id,
         r.client_id,
         (cl.first_name || ' ' || cl.last_name) AS client_name,
         r.user_id AS agent_id,
         (u.first_name || ' ' || u.last_name) AS agent_name,
         r.product_type,
         r.loan_type,
         r.udi_number,
         r.remarks,
         r.approval_notes,
         r.status,
         r.created_at
       ${baseQuery}
       ORDER BY r.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, perPage, offset]
    );

    return c.json({ items: dataResult.rows, page, perPage, totalItems, totalPages });
  } finally {
    dbClient.release();
  }
});

// Admin: CSV export
releases.get('/admin/export', authMiddleware, requireRole('admin'), async (c) => {
  const dbClient = await pool.connect();
  try {
    const q = c.req.query();

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (q.search) {
      conditions.push(`(cl.first_name || ' ' || cl.last_name) ILIKE $${idx}`);
      params.push(`%${q.search}%`);
      idx++;
    }
    if (q.status) {
      conditions.push(`r.status = $${idx}`);
      params.push(q.status);
      idx++;
    }
    if (q.agent_id) {
      conditions.push(`r.user_id = $${idx}`);
      params.push(q.agent_id);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await dbClient.query(
      `SELECT
         (cl.first_name || ' ' || cl.last_name) AS "Client Name",
         (u.first_name || ' ' || u.last_name) AS "Agent",
         COALESCE(r.product_type, '') AS "Product Type",
         COALESCE(r.loan_type, '') AS "Loan Type",
         COALESCE(r.udi_number::text, '') AS "UDI Number",
         COALESCE(r.status, '') AS "Status",
         COALESCE(r.approval_notes, '') AS "Notes",
         TO_CHAR(r.created_at, 'YYYY-MM-DD HH24:MI') AS "Date"
       FROM releases r
       JOIN clients cl ON cl.id = r.client_id
       JOIN users u ON u.id = r.user_id
       ${where}
       ORDER BY r.created_at DESC`,
      params
    );

    const headers = ['Client Name', 'Agent', 'Product Type', 'Loan Type', 'UDI Number', 'Status', 'Notes', 'Date'];
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

    const filename = `releases-export-${new Date().toISOString().slice(0, 10)}.csv`;
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.text(csvRows.join('\n'));
  } finally {
    dbClient.release();
  }
});

// Get all releases (with filters)
releases.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const filters = c.req.query();
  const releases = await releaseService.findAll(user.sub, filters);
  return c.json(releases);
});

// Get release by ID
releases.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const release = await releaseService.findById(id);
  if (!release) return c.json({ error: 'Release not found' }, 404);
  return c.json(release);
});

// Create release
releases.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const data = await c.req.json();
    const release = await releaseService.create({ ...data, user_id: user.sub });

    // Mark pending itineraries for this client as completed (non-blocking)
    if (release.client_id) {
      pool.query(
        `UPDATE itineraries SET status = 'completed', updated_at = NOW()
         WHERE client_id = $1 AND status = 'pending'`,
        [release.client_id]
      ).catch((err: any) => console.error('[Releases] Failed to update itineraries:', err.message));
    }

    return c.json(release, 201);
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

// Update release
releases.patch('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ error: 'Invalid ID' }, 400);
    const data = await c.req.json();
    const release = await releaseService.update(id, data);
    if (!release) return c.json({ error: 'Release not found' }, 404);
    return c.json(release);
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

// Approve release
releases.post('/:id/approve', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const notes = body?.notes;
  const release = await releaseService.approve(id, user.sub, notes);
  if (!release) return c.json({ error: 'Release not found' }, 404);
  return c.json(release);
});

// Reject release
releases.post('/:id/reject', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const notes = body?.notes;
  const release = await releaseService.reject(id, user.sub, notes);
  if (!release) return c.json({ error: 'Release not found' }, 404);
  return c.json(release);
});

// Delete release
releases.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Invalid ID' }, 400);
  await releaseService.delete(id);
  return c.json({ success: true });
});

export default releases;
