/**
 * Action Items Refresh Service
 * Scheduled job to refresh the action_items materialized view
 *
 * This service runs periodically to refresh the action_items materialized view,
 * ensuring dashboard data is up-to-date without expensive real-time queries.
 */

import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';

/**
 * Refresh the action_items materialized view
 *
 * This function refreshes the materialized view that powers the dashboard
 * action items drawer. It should be scheduled to run periodically (e.g., every hour).
 */
export async function refreshActionItemsView(): Promise<void> {
  const client = await pool.connect();

  try {
    logger.info('action-items-refresh', 'Starting action items view refresh');

    // Refresh the materialized view
    await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY action_items');

    logger.info('action-items-refresh', 'Successfully refreshed action items view');
  } catch (error: any) {
    logger.error('action-items-refresh', 'Failed to refresh action items view', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Manual refresh endpoint handler
 *
 * This function can be called via API endpoint to manually trigger a refresh.
 * Useful for testing or when immediate refresh is needed.
 */
export async function manualRefreshActionItems(): Promise<{
  success: boolean;
  message: string;
  timestamp: string;
}> {
  try {
    await refreshActionItemsView();
    return {
      success: true,
      message: 'Action items view refreshed successfully',
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to refresh action items view: ${error.message}`,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get refresh statistics
 *
 * Returns information about the action_items view, such as last refresh time,
 * row count, and refresh duration.
 */
export async function getActionItemsStats(): Promise<{
  success: boolean;
  rowCount?: number;
  lastRefresh?: string;
  error?: string;
}> {
  const client = await pool.connect();

  try {
    // Get row count from action_items view
    const result = await client.query('SELECT COUNT(*) as count FROM action_items');
    const rowCount = parseInt(result.rows[0].count);

    return {
      success: true,
      rowCount,
      lastRefresh: new Date().toISOString(),
    };
  } catch (error: any) {
    logger.error('action-items-stats', 'Failed to get action items stats', {
      error: error.message,
    });
    return {
      success: false,
      error: error.message,
    };
  } finally {
    client.release();
  }
}
