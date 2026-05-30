import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { emailService } from '../services/email.js';
import { pool } from '../db/index.js';

const feedback = new Hono();

const TYPES = ['bug', 'idea', 'question', 'other'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const STATUSES = ['open', 'in_progress', 'done', 'wont_fix'] as const;

const submitSchema = z.object({
  type: z.enum(TYPES),
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(5000),
  severity: z.enum(SEVERITIES).optional().nullable(),
  notifyUser: z.boolean().optional().default(false),
  screenshotDataUrl: z.string().optional().nullable(),
  context: z.object({
    url: z.string().optional(),
    route: z.string().optional(),
    userAgent: z.string().optional(),
    viewport: z.string().optional(),
    appVersion: z.string().optional(),
  }).optional().nullable(),
});

// POST /api/feedback — submit feedback (any authenticated user)
feedback.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = submitSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const d = parsed.data;

  // Persist to DB
  const result = await pool.query(
    `INSERT INTO feedback_reports
       (user_id, user_email, user_name, type, title, description, severity, notify_user, context)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      user.sub,
      user.email,
      `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email,
      d.type,
      d.title,
      d.description,
      d.type === 'bug' ? (d.severity ?? null) : null,
      d.notifyUser,
      d.context ? JSON.stringify(d.context) : null,
    ]
  );

  const reportId: number = result.rows[0].id;

  // Send email (fire-and-forget — failure must not affect user)
  emailService.sendFeedbackReport({
    id: reportId,
    fromEmail: user.email,
    fromName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email,
    type: d.type,
    title: d.title,
    description: d.description,
    severity: d.type === 'bug' ? (d.severity ?? null) : null,
    notifyUser: d.notifyUser ?? false,
    context: d.context ?? null,
  }).catch(() => {/* swallowed */});

  return c.json({ success: true, id: reportId });
});

// GET /api/feedback — admin list (manager/admin only)
feedback.get(
  '/',
  authMiddleware,
  requireRole('admin', 'area_manager', 'assistant_area_manager'),
  async (c) => {
    const type = c.req.query('type') ?? '';
    const status = c.req.query('status') ?? '';
    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (type && TYPES.includes(type as typeof TYPES[number])) {
      conditions.push(`type = $${params.push(type)}`);
    }
    if (status && STATUSES.includes(status as typeof STATUSES[number])) {
      conditions.push(`status = $${params.push(status)}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM feedback_reports ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const rows = await pool.query(
      `SELECT id, user_email, user_name, type, title, severity, status, notify_user, created_at, resolved_at
       FROM feedback_reports ${where}
       ORDER BY id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return c.json({
      data: rows.rows,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  }
);

// GET /api/feedback/:id — single report detail (admin)
feedback.get(
  '/:id',
  authMiddleware,
  requireRole('admin', 'area_manager', 'assistant_area_manager'),
  async (c) => {
    const id = parseInt(c.req.param('id') ?? '', 10);
    if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

    const result = await pool.query(
      `SELECT * FROM feedback_reports WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) return c.json({ error: 'Not found' }, 404);

    return c.json(result.rows[0]);
  }
);

// PATCH /api/feedback/:id/status — update status (admin)
feedback.patch(
  '/:id/status',
  authMiddleware,
  requireRole('admin', 'area_manager', 'assistant_area_manager'),
  async (c) => {
    const id = parseInt(c.req.param('id') ?? '', 10);
    if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

    const body = await c.req.json();
    const status = body?.status;
    if (!STATUSES.includes(status)) {
      return c.json({ error: `status must be one of: ${STATUSES.join(', ')}` }, 422);
    }

    await pool.query(
      `UPDATE feedback_reports
       SET status = $1,
           resolved_at = CASE WHEN $1 = 'done' AND resolved_at IS NULL THEN NOW() ELSE resolved_at END,
           updated_at = NOW()
       WHERE id = $2`,
      [status, id]
    );

    return c.json({ success: true });
  }
);

export default feedback;
