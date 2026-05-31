/**
 * Firebase Cloud Messaging (FCM) service.
 *
 * Sends data-only push messages to wake up the mobile app so PowerSync
 * can re-sync and surface the new notification row.  The push payload
 * carries no user data — it is only a sync trigger.
 *
 * Setup:
 *   Set FCM_SERVICE_ACCOUNT_JSON in the environment to the full
 *   Firebase service-account JSON (single line, base64, or raw JSON string).
 *   Without it the service logs a one-time warning and silently no-ops.
 */

import admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';
import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';

let _initialized = false;
let _initAttempted = false;

function initFirebase(): void {
  if (_initAttempted) return;
  _initAttempted = true;

  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    logger.warn('fcm', 'FCM_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
    return;
  }

  try {
    let json = raw.trim();
    // Support base64-encoded value
    if (!json.startsWith('{')) {
      json = Buffer.from(json, 'base64').toString('utf8');
    }
    const serviceAccount: ServiceAccount = JSON.parse(json);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    _initialized = true;
    logger.info('fcm', 'Firebase Admin SDK initialized');
  } catch (e) {
    logger.error('fcm', 'Failed to initialize Firebase Admin SDK', { error: e });
  }
}

/**
 * Send an FCM push to all registered device tokens for a user.
 * Always includes a data payload for PowerSync wake-up.
 * When title/body are provided, also includes a notification payload so the
 * OS can display a heads-up banner when the app is in the background/terminated.
 * Silently no-ops when Firebase is not configured.
 */
export async function sendFcmPushToUser(
  userId: string,
  options?: { title?: string; body?: string; data?: Record<string, string> },
): Promise<void> {
  initFirebase();
  if (!_initialized) return;

  let tokens: string[];
  try {
    const result = await pool.query(
      'SELECT token FROM device_tokens WHERE user_id = $1',
      [userId],
    );
    tokens = result.rows.map((r) => r.token as string);
  } catch (e) {
    logger.error('fcm', 'Failed to fetch device tokens', { userId, error: e });
    return;
  }

  if (tokens.length === 0) return;

  const hasNotification = !!(options?.title);
  const message: admin.messaging.MulticastMessage = {
    tokens,
    data: { type: 'sync', ...(options?.data ?? {}) },
    ...(hasNotification && {
      notification: { title: options!.title, body: options!.body },
    }),
    android: {
      priority: 'high',
      ...(hasNotification && {
        notification: { channelId: 'imu_notifications', sound: 'default' },
      }),
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': hasNotification ? 'alert' : 'background',
      },
      payload: {
        aps: hasNotification
          ? { alert: { title: options!.title, body: options!.body }, sound: 'default' }
          : { 'content-available': 1 },
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    logger.info('fcm', `Push sent to ${userId}: ${response.successCount} ok, ${response.failureCount} failed`);

    // Remove stale tokens that were rejected by FCM
    const staleTokens = response.responses
      .map((r, i) => (!r.success ? tokens[i] : null))
      .filter(Boolean) as string[];

    if (staleTokens.length > 0) {
      await pool.query(
        'DELETE FROM device_tokens WHERE user_id = $1 AND token = ANY($2::text[])',
        [userId, staleTokens],
      );
    }
  } catch (e) {
    logger.error('fcm', 'Failed to send FCM multicast', { userId, error: e });
  }
}
