// src/services/touchpoint-mv-refresh.ts

/**
 * Touchpoint Materialized View Refresh Service
 *
 * Refreshes the client_touchpoint_summary_mv materialized view every 5 minutes
 * Ensures touchpoint summary data stays fresh for caching layer
 *
 * Part of Redis caching implementation
 *
 * @file touchpoint-mv-refresh.ts
 */

import { pool } from '../db/index.js';

/**
 * Materialized view refresh statistics
 */
export interface MVRefreshStats {
  success: boolean;
  duration_ms: number;
  row_count: number;
  error?: string;
  refreshed_at: string;
}

/**
 * Refresh the client_touchpoint_summary_mv materialized view
 * Uses CONCURRENTLY option to allow reads during refresh
 * @returns Refresh statistics
 */
export async function refreshTouchpointSummaryMV(): Promise<MVRefreshStats> {
  const startTime = Date.now();
  const stats: MVRefreshStats = {
    success: false,
    duration_ms: 0,
    row_count: 0,
    refreshed_at: new Date().toISOString(),
  };

  try {
    console.log('[MVRefresh] Starting materialized view refresh');

    // Refresh the materialized view with CONCURRENTLY option
    // This allows reads during refresh (requires unique index)
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY client_touchpoint_summary_mv');

    // Get row count after refresh
    const countResult = await pool.query('SELECT COUNT(*) as count FROM client_touchpoint_summary_mv');
    stats.row_count = parseInt(countResult.rows[0].count);
    stats.success = true;
    stats.duration_ms = Date.now() - startTime;

    console.log('[MVRefresh] Materialized view refreshed successfully:', {
      row_count: stats.row_count,
      duration_ms: stats.duration_ms,
    });

    return stats;
  } catch (error) {
    stats.duration_ms = Date.now() - startTime;
    stats.error = error instanceof Error ? error.message : 'Unknown error';

    console.error('[MVRefresh] Materialized view refresh failed:', {
      error: stats.error,
      duration_ms: stats.duration_ms,
    });

    throw error;
  }
}

/**
 * Get the last refresh time from the materialized view
 * Uses the updated_at column that's maintained by the MV
 * @returns Last refresh time or null if MV doesn't exist
 */
export async function getMVLastRefreshTime(): Promise<Date | null> {
  try {
    const result = await pool.query(
      `SELECT MAX(updated_at) as last_refresh FROM client_touchpoint_summary_mv`
    );

    if (result.rows.length === 0 || !result.rows[0].last_refresh) {
      return null;
    }

    return new Date(result.rows[0].last_refresh);
  } catch (error) {
    console.error('[MVRefresh] Failed to get last refresh time:', error);
    return null;
  }
}

/**
 * Check if materialized view refresh is needed
 * Returns true if MV is older than 10 minutes or doesn't exist
 * @returns True if refresh is needed
 */
export async function isMVRefreshNeeded(): Promise<boolean> {
  const lastRefresh = await getMVLastRefreshTime();

  if (!lastRefresh) {
    return true; // MV doesn't exist, needs refresh
  }

  // Check if MV is older than 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  return lastRefresh < tenMinutesAgo;
}
