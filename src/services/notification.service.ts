import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { sendFcmPushToUser } from './fcm.service.js';

export type NotificationType =
  | 'approval_approved'
  | 'approval_rejected'
  | 'announcement'
  | 'missed_visit'
  | 'touchpoint_recorded'
  | 'loan_released'
  | 'geofence_alert';

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  fcmData?: Record<string, string>,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, body, JSON.stringify(data)],
    );
    // Non-blocking FCM push — wakes PowerSync and shows system notification
    sendFcmPushToUser(userId, { title, body, data: fcmData }).catch(() => {});
  } catch (e) {
    logger.error('notifications', 'Failed to create notification', { userId, type, error: e });
  }
}

export async function createAnnouncementNotifications(
  announcementId: string,
  title: string,
  body: string,
  targetRoles: string[],
): Promise<void> {
  try {
    // Fan-out: insert one notification per active user matching the target roles.
    // Query users.role directly — user_profiles table was removed in migration 019.
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       SELECT u.id, 'announcement', $1, $2, jsonb_build_object('announcement_id', $3::text)
       FROM users u
       WHERE u.role = ANY($4::text[])
         AND u.is_active = true
       RETURNING user_id`,
      [title, body, announcementId, targetRoles],
    );

    // Fire FCM push to each recipient — wakes PowerSync and shows system notification
    const userIds: string[] = result.rows.map((r: { user_id: string }) => r.user_id);
    for (const userId of userIds) {
      sendFcmPushToUser(userId, { title, body }).catch(() => {});
    }
  } catch (e) {
    logger.error('notifications', 'Failed to fan-out announcement notifications', {
      announcementId,
      error: e,
    });
  }
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE id = $1 AND user_id = $2 AND read_at IS NULL
     RETURNING id`,
    [notificationId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await pool.query(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return result.rowCount ?? 0;
}

export async function clearNotifications(userId: string): Promise<number> {
  const result = await pool.query(
    `DELETE FROM notifications
     WHERE user_id = $1`,
    [userId],
  );
  return result.rowCount ?? 0;
}

export async function clearReadNotifications(userId: string): Promise<number> {
  const result = await pool.query(
    `DELETE FROM notifications
     WHERE user_id = $1 AND read_at IS NOT NULL`,
    [userId],
  );
  return result.rowCount ?? 0;
}

export async function cleanupOldNotifications(retentionDays = 3): Promise<number> {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error('retentionDays must be at least 1');
  }

  const result = await pool.query(
    `DELETE FROM notifications
     WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [retentionDays],
  );

  const deleted = result.rowCount ?? 0;
  logger.info('notifications', 'Cleaned up old notifications', {
    deleted,
    retentionDays,
  });
  return deleted;
}
