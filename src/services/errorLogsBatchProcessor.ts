import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';

/**
 * Mark mobile error logs as synced.
 * Mobile logs arrive via PowerSync directly into error_logs (is_synced = false).
 * They are already in the right table — no re-insertion needed; just acknowledge them.
 */
export async function processMobileErrorLogs() {
  try {
    const result = await pool.query(`
      UPDATE error_logs
      SET is_synced = TRUE, updated_at = NOW()
      WHERE is_synced = FALSE AND platform = 'mobile'
      RETURNING id
    `);

    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info('error-logs', `Mobile error logs processed: ${count} marked as synced`);
    }
  } catch (e) {
    logger.error('error-logs', 'Failed to process mobile error logs', { error: e });
  }
}
