import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';
import {
  markNotificationRead,
  markAllNotificationsRead,
  createAnnouncementNotifications,
} from '../services/notification.service.js';
import { requirePermission } from '../middleware/permissions.js';

const notifications = new Hono();

// GET /api/notifications — current user's notifications (paginated)
notifications.get('/', authMiddleware, async (c) => {
  const user = c.get('user');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const unreadOnly = c.req.query('unread') === 'true';

  const conditions = ['user_id = $1'];
  const params: unknown[] = [user.sub];

  if (unreadOnly) {
    conditions.push('read_at IS NULL');
  }

  const where = conditions.join(' AND ');
  params.push(limit, offset);

  const [rows, countResult] = await Promise.all([
    pool.query(
      `SELECT id, type, title, body, data, read_at, created_at
       FROM notifications
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE read_at IS NULL) AS unread
       FROM notifications WHERE user_id = $1`,
      [user.sub],
    ),
  ]);

  return c.json({
    success: true,
    notifications: rows.rows,
    total: parseInt(countResult.rows[0].total),
    unread: parseInt(countResult.rows[0].unread),
  });
});

// PATCH /api/notifications/:id/read
notifications.patch('/:id/read', authMiddleware, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const updated = await markNotificationRead(id ?? '', user.sub);
  if (!updated) {
    return c.json({ success: false, error: 'Notification not found or already read' }, 404);
  }
  return c.json({ success: true });
});

// PATCH /api/notifications/read-all
notifications.patch('/read-all', authMiddleware, async (c) => {
  const user = c.get('user');
  const count = await markAllNotificationsRead(user.sub);
  return c.json({ success: true, marked: count });
});

// POST /api/notifications/announcements — admin/manager only
notifications.post(
  '/announcements',
  authMiddleware,
  requirePermission('announcements', 'create'),
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json<{
      title: string;
      body: string;
      target_roles: string[];
      target_area_id?: string;
    }>();

    if (!body.title || !body.body || !Array.isArray(body.target_roles)) {
      return c.json({ success: false, error: 'title, body, and target_roles are required' }, 400);
    }

    const result = await pool.query(
      `INSERT INTO announcements (created_by, title, body, target_roles, target_area_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [user.sub, body.title, body.body, body.target_roles, body.target_area_id ?? null],
    );

    const announcementId = result.rows[0].id as string;
    await createAnnouncementNotifications(
      announcementId,
      body.title,
      body.body,
      body.target_roles,
    );

    return c.json({ success: true, id: announcementId }, 201);
  },
);

export default notifications;
