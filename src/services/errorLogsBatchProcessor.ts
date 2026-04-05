import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';

/**
 * Process mobile error logs from PowerSync
 * Reads queued errors (is_synced = 0) and batches them to main error_logs table
 */
export async function processMobileErrorLogs() {
  try {
    const result = await pool.query(`
      SELECT
        id,
        code,
        message,
        platform,
        stack_trace,
        user_id,
        request_id,
        fingerprint,
        app_version,
        os_version,
        device_info,
        details,
        created_at
      FROM error_logs
      WHERE is_synced = FALSE
        AND platform = 'mobile'
      ORDER BY created_at ASC
      LIMIT 100
    `);

    logger.info('error-logs', `Processing ${result.rows.length} mobile error logs`);

    let processed = 0;
    let failed = 0;

    for (const row of result.rows) {
      try {
        // Insert into main error_logs table
        await pool.query(`
          INSERT INTO error_logs (
            code, message, platform, stack_trace, user_id, request_id,
            fingerprint, app_version, os_version, device_info, details,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (fingerprint) DO NOTHING
        `, [
          row.code,
          row.message,
          row.platform,
          row.stack_trace,
          row.user_id,
          row.request_id,
          row.fingerprint,
          row.app_version,
          row.os_version,
          row.device_info,
          row.details,
          row.created_at,
        ]);

        // Mark as synced
        await pool.query('UPDATE error_logs SET is_synced = TRUE WHERE id = $1', [row.id]);
        processed++;
      } catch (e) {
        logger.error('error-logs', `Failed to process mobile error log: ${row.id}`, { error: e });
        failed++;
      }
    }

    logger.info('error-logs', `Mobile error logs processed: ${processed} succeeded, ${failed} failed`);
  } catch (e) {
    logger.error('error-logs', 'Failed to process mobile error logs', { error: e });
  }
}
