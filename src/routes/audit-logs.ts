/**
 * Audit Logs Routes
 * View and query system audit trails
 */

import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { getAuditLogs, AuditEntity, AuditAction, cleanupOldAuditLogs, getAuditLogStats } from '../middleware/audit.js';
import { success, paginated, unauthorized } from '../utils/response.js';
import { pool } from '../db/index.js';

const auditLogs = new Hono();

// GET /api/audit-logs - List audit logs (admin only)
auditLogs.get('/', authMiddleware, requirePermission('audit_logs', 'read'), async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '50');
    const userId = c.req.query('user_id');
    const entity = c.req.query('entity') as AuditEntity | undefined;
    const entityId = c.req.query('entity_id');
    const action = c.req.query('action') as AuditAction | undefined;
    const source = c.req.query('source') as 'mobile' | 'web' | 'api' | 'unknown' | undefined;
    const startDateStr = c.req.query('start_date');
    const endDateStr = c.req.query('end_date');

    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    const result = await getAuditLogs({
      userId,
      entity,
      entityId,
      action,
      source,
      startDate,
      endDate,
      page,
      perPage,
    });

    return paginated(c, result.items, page, perPage, result.total);
  } catch (error) {
    console.error('Get audit logs error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// GET /api/audit-logs/stats - Audit statistics
auditLogs.get('/stats', authMiddleware, requirePermission('audit_logs', 'read'), async (c) => {
  try {
    // Get counts by action
    const actionStats = await pool.query(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY action
      ORDER BY count DESC
    `);

    // Get counts by entity
    const entityStats = await pool.query(`
      SELECT entity, COUNT(*) as count
      FROM audit_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY entity
      ORDER BY count DESC
    `);

    // Get recent activity by user
    const userActivity = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, COUNT(*) as action_count
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY action_count DESC
      LIMIT 10
    `);

    // Get daily activity trend
    const dailyTrend = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM audit_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    return success(c, {
      actionStats: actionStats.rows,
      entityStats: entityStats.rows,
      topUsers: userActivity.rows,
      dailyTrend: dailyTrend.rows,
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// GET /api/audit-logs/entity/:entity/:id - Get audit history for specific entity
auditLogs.get('/entity/:entity/:id', authMiddleware, requirePermission('audit_logs', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const entity = c.req.param('entity') as AuditEntity;
    const entityId = c.req.param('id');

    // Only admin/staff can view all audit logs
    // Regular users can only see their own related audit logs
    if (user.role === 'field_agent' && !['client', 'touchpoint', 'itinerary'].includes(entity)) {
      return unauthorized(c, 'Not authorized to view these audit logs');
    }

    const result = await getAuditLogs({
      entity,
      entityId,
      page: 1,
      perPage: 100,
    });

    return success(c, result.items);
  } catch (error) {
    console.error('Get entity audit logs error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// GET /api/audit-logs/stream - Server-Sent Events stream for real-time audit logs
auditLogs.get('/stream', authMiddleware, requirePermission('audit_logs', 'read'), async (c) => {
  // Set SSE headers
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no'); // Disable nginx buffering

  const user = c.get('user');

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection message
      const connectEvent = `event: connected\ndata: ${JSON.stringify({ message: 'Connected to audit log stream', userId: user.sub, timestamp: new Date().toISOString() })}\n\n`;
      controller.enqueue(encoder.encode(connectEvent));

      // Create a dedicated database connection for LISTEN
      let dbClient: any;
      try {
        dbClient = await pool.connect();

        // Listen for PostgreSQL NOTIFY events
        await dbClient.query('LISTEN audit_log_new');

        // Set up notification handler
        dbClient.on('notification', async (msg: any) => {
          if (msg.channel === 'audit_log_new' && msg.payload) {
            try {
              const auditLogId = msg.payload;

              // Fetch the full audit log entry
              const result = await pool.query(
                `SELECT al.*, u.first_name, u.last_name, u.email as user_email
                 FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
                 WHERE al.id = $1`,
                [auditLogId]
              );

              if (result.rows.length > 0) {
                const row = result.rows[0];
                const auditLog = {
                  id: row.id,
                  userId: row.user_id,
                  userName: row.first_name ? `${row.first_name} ${row.last_name}` : 'System',
                  userEmail: row.user_email,
                  action: row.action,
                  entity: row.entity,
                  entityId: row.entity_id,
                  oldValues: row.old_values,
                  newValues: row.new_values,
                  ipAddress: row.ip_address,
                  userAgent: row.user_agent,
                  metadata: row.metadata,
                  createdAt: row.created_at,
                };

                // Send SSE event
                const sseEvent = `event: audit_log\ndata: ${JSON.stringify(auditLog)}\n\n`;
                controller.enqueue(encoder.encode(sseEvent));
              }
            } catch (error) {
              console.error('[Audit Stream] Error fetching audit log:', error);
            }
          }
        });

        // Send keepalive comments every 30 seconds to prevent connection timeout
        const keepaliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch {
            // Connection closed, stop sending
            clearInterval(keepaliveInterval);
          }
        }, 30000);

      } catch (error) {
        console.error('[Audit Stream] Error setting up database listener:', error);
        const errorEvent = `event: error\ndata: ${JSON.stringify({ error: 'Failed to establish database connection' })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      }
    },
  });

  return c.body(stream);
});

// GET /api/audit-logs/stats/storage - Get storage statistics (admin only)
auditLogs.get('/stats/storage', authMiddleware, requirePermission('audit_logs', 'read'), async (c) => {
  try {
    const stats = await getAuditLogStats();
    return success(c, stats);
  } catch (error) {
    console.error('Get audit storage stats error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// POST /api/audit-logs/cleanup - Manually trigger cleanup of old audit logs (admin only)
auditLogs.post('/cleanup', authMiddleware, requirePermission('audit_logs', 'delete'), async (c) => {
  try {
    const retentionDays = parseInt(c.req.query('retention_days') || '90', 10);

    if (retentionDays < 30) {
      return c.json({ message: 'Retention period must be at least 30 days' }, 400);
    }

    const result = await cleanupOldAuditLogs(retentionDays);

    if (result.error) {
      return c.json({ message: result.error }, 500);
    }

    return success(c, {
      message: `Cleaned up ${result.deleted} audit logs older than ${retentionDays} days`,
      deleted: result.deleted,
      retentionDays
    });
  } catch (error) {
    console.error('Audit cleanup error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default auditLogs;
