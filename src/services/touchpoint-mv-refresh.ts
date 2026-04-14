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
import { retryWithBackoff, CircuitBreaker } from '../utils/retry.js';

/**
 * Circuit breakers for MV refresh operations
 * Prevents cascade failures when database is unavailable
 */
const touchpointSummaryMVBreaker = new CircuitBreaker(
  5, // Open circuit after 5 consecutive failures
  60000 // Close circuit after 1 minute
);

const callableClientsMVBreaker = new CircuitBreaker(
  5, // Open circuit after 5 consecutive failures
  60000 // Close circuit after 1 minute
);

const adminClientsMVBreaker = new CircuitBreaker(
  5, // Open circuit after 5 consecutive failures
  60000 // Close circuit after 1 minute
);

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
 * Includes retry logic with exponential backoff for transient failures
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

  console.log('[MVRefresh] Starting materialized view refresh with retry logic');

  // Retry configuration for MV refresh
  const retryResult = await retryWithBackoff(async () => {
    // Refresh the materialized view with CONCURRENTLY option
    // This allows reads during refresh (requires unique index)
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY client_touchpoint_summary_mv');

    // Get row count after refresh
    const countResult = await pool.query('SELECT COUNT(*) as count FROM client_touchpoint_summary_mv');
    stats.row_count = parseInt(countResult.rows[0].count);
    stats.success = true;

    console.log('[MVRefresh] Materialized view refreshed successfully:', {
      row_count: stats.row_count,
      duration_ms: Date.now() - startTime,
    });

    return stats;
  }, {
    maxRetries: 3,
    baseDelay: 1000, // Start with 1 second delay
    maxDelay: 10000, // Max 10 second delay
    jitter: true,
    shouldRetry: (error, attempt) => {
      // Retry on transient errors
      const errorMessage = error.message.toLowerCase();
      const isTransientError =
        errorMessage.includes('connection') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('temporary') ||
        errorMessage.includes('deadlock') ||
        errorMessage.includes('could not serialize') ||
        errorMessage.includes('database is starting up');

      if (!isTransientError) {
        console.error('[MVRefresh] Non-transient error, not retrying:', {
          error: error.message,
          attempt,
        });
      }

      return isTransientError;
    },
  });

  if (retryResult.success) {
    stats.duration_ms = Date.now() - startTime;
    return stats;
  }

  // All retries failed
  stats.duration_ms = Date.now() - startTime;
  stats.error = retryResult.error?.message || 'Unknown error after retries';

  console.error('[MVRefresh] Materialized view refresh failed after retries:', {
    error: stats.error,
    attempts: retryResult.attempts,
    totalDurationMs: retryResult.totalDurationMs,
  });

  throw retryResult.error || new Error(stats.error);
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

/**
 * Refresh the callable_clients_mv materialized view
 * Uses CONCURRENTLY option to allow reads during refresh
 * This MV is used for the hybrid query optimization (90% of requests)
 * Includes retry logic with exponential backoff and circuit breaker
 * @returns Refresh statistics
 */
export async function refreshCallableClientsMV(): Promise<MVRefreshStats> {
  const startTime = Date.now();
  const stats: MVRefreshStats = {
    success: false,
    duration_ms: 0,
    row_count: 0,
    refreshed_at: new Date().toISOString(),
  };

  console.log('[MVRefresh] Starting callable_clients_mv refresh with retry logic');

  try {
    // Use circuit breaker to prevent cascade failures
    await callableClientsMVBreaker.execute(async () => {
      // Check if MV exists first
      const mvExistsResult = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'callable_clients_mv'
        ) as exists
      `);

      if (!mvExistsResult.rows[0].exists) {
        console.log('[MVRefresh] callable_clients_mv does not exist, skipping refresh');
        stats.success = true;
        stats.duration_ms = Date.now() - startTime;
        return;
      }

      // Retry configuration for MV refresh
      const retryResult = await retryWithBackoff(async () => {
        // Refresh the materialized view with CONCURRENTLY option
        // This allows reads during refresh (requires unique index)
        await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY callable_clients_mv');

        // Get row count after refresh
        const countResult = await pool.query('SELECT COUNT(*) as count FROM callable_clients_mv');
        stats.row_count = parseInt(countResult.rows[0].count);
        stats.success = true;

        console.log('[MVRefresh] callable_clients_mv refreshed successfully:', {
          row_count: stats.row_count,
          duration_ms: Date.now() - startTime,
        });

        return stats;
      }, {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        jitter: true,
        shouldRetry: (error, attempt) => {
          const errorMessage = error.message.toLowerCase();
          const isTransientError =
            errorMessage.includes('connection') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('temporary') ||
            errorMessage.includes('deadlock') ||
            errorMessage.includes('could not serialize') ||
            errorMessage.includes('database is starting up');

          if (!isTransientError) {
            console.error('[MVRefresh] Non-transient error, not retrying:', {
              error: error.message,
              attempt,
            });
          }

          return isTransientError;
        },
      });

      if (!retryResult.success) {
        throw retryResult.error || new Error('Refresh failed after retries');
      }
    });

    stats.duration_ms = Date.now() - startTime;
    return stats;
  } catch (error) {
    stats.duration_ms = Date.now() - startTime;
    stats.error = error instanceof Error ? error.message : 'Unknown error';

    console.error('[MVRefresh] callable_clients_mv refresh failed:', {
      error: stats.error,
      duration_ms: stats.duration_ms,
      circuitBreakerState: callableClientsMVBreaker.getState(),
    });

    // Don't throw error for callable_clients_mv refresh failure
    // It's an optimization, not critical for functionality
    return stats;
  }
}

/**
 * Refresh the admin_clients_mv materialized view
 * Uses CONCURRENTLY option to allow reads during refresh
 * This MV is used for admin dashboard queries (stats, analytics, client lists)
 * Includes retry logic with exponential backoff and circuit breaker
 * @returns Refresh statistics
 */
export async function refreshAdminClientsMV(): Promise<MVRefreshStats> {
  const startTime = Date.now();
  const stats: MVRefreshStats = {
    success: false,
    duration_ms: 0,
    row_count: 0,
    refreshed_at: new Date().toISOString(),
  };

  console.log('[MVRefresh] Starting admin_clients_mv refresh with retry logic');

  try {
    // Use circuit breaker to prevent cascade failures
    await adminClientsMVBreaker.execute(async () => {
      // Check if MV exists first
      const mvExistsResult = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'admin_clients_mv'
        ) as exists
      `);

      if (!mvExistsResult.rows[0].exists) {
        console.log('[MVRefresh] admin_clients_mv does not exist, skipping refresh');
        stats.success = true;
        stats.duration_ms = Date.now() - startTime;
        return;
      }

      // Retry configuration for MV refresh
      const retryResult = await retryWithBackoff(async () => {
        // Refresh the materialized view with CONCURRENTLY option
        await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY admin_clients_mv');

        // Get row count after refresh
        const countResult = await pool.query('SELECT COUNT(*) as count FROM admin_clients_mv');
        stats.row_count = parseInt(countResult.rows[0].count);
        stats.success = true;

        console.log('[MVRefresh] admin_clients_mv refreshed successfully:', {
          row_count: stats.row_count,
          duration_ms: Date.now() - startTime,
        });

        return stats;
      }, {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        jitter: true,
        shouldRetry: (error, attempt) => {
          const errorMessage = error.message.toLowerCase();
          const isTransientError =
            errorMessage.includes('connection') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('temporary') ||
            errorMessage.includes('deadlock') ||
            errorMessage.includes('could not serialize') ||
            errorMessage.includes('database is starting up');

          if (!isTransientError) {
            console.error('[MVRefresh] Non-transient error, not retrying:', {
              error: error.message,
              attempt,
            });
          }

          return isTransientError;
        },
      });

      if (!retryResult.success) {
        throw retryResult.error || new Error('Refresh failed after retries');
      }
    });

    stats.duration_ms = Date.now() - startTime;
    return stats;
  } catch (error) {
    stats.duration_ms = Date.now() - startTime;
    stats.error = error instanceof Error ? error.message : 'Unknown error';

    console.error('[MVRefresh] admin_clients_mv refresh failed:', {
      error: stats.error,
      duration_ms: stats.duration_ms,
      circuitBreakerState: adminClientsMVBreaker.getState(),
    });

    // Don't throw error for admin_clients_mv refresh failure
    // It's an optimization, not critical for functionality
    return stats;
  }
}

/**
 * Refresh all materialized views in sequence
 * Calls refreshTouchpointSummaryMV, refreshCallableClientsMV, refreshAdminClientsMV
 * Uses circuit breakers to prevent cascade failures
 * @returns Combined refresh statistics
 */
export async function refreshAllMaterializedViews(): Promise<{
  touchpoint_summary: MVRefreshStats;
  callable_clients: MVRefreshStats;
  admin_clients: MVRefreshStats;
}> {
  console.log('[MVRefresh] Starting full materialized view refresh sequence with circuit breakers');

  // Initialize with default values to avoid TypeScript errors
  let touchpointSummaryStats: MVRefreshStats = {
    success: false,
    duration_ms: 0,
    row_count: 0,
    refreshed_at: new Date().toISOString(),
  };
  let callableClientsStats: MVRefreshStats = {
    success: false,
    duration_ms: 0,
    row_count: 0,
    refreshed_at: new Date().toISOString(),
  };
  let adminClientsStats: MVRefreshStats = {
    success: false,
    duration_ms: 0,
    row_count: 0,
    refreshed_at: new Date().toISOString(),
  };

  // Refresh touchpoint summary MV first (required by callable_clients MV)
  try {
    await touchpointSummaryMVBreaker.execute(async () => {
      touchpointSummaryStats = await refreshTouchpointSummaryMV();
    });
  } catch (error) {
    console.error('[MVRefresh] Touchpoint summary MV refresh failed, circuit breaker opened:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      circuitBreakerState: touchpointSummaryMVBreaker.getState(),
    });

    touchpointSummaryStats = {
      success: false,
      duration_ms: 0,
      row_count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      refreshed_at: new Date().toISOString(),
    };
  }

  // Then refresh callable clients MV (depends on touchpoint summary MV)
  // Note: We always try to refresh callable_clients MV even if touchpoint_summary failed
  try {
    await callableClientsMVBreaker.execute(async () => {
      callableClientsStats = await refreshCallableClientsMV();
    });
  } catch (error) {
    console.error('[MVRefresh] Callable clients MV refresh failed, circuit breaker opened:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      circuitBreakerState: callableClientsMVBreaker.getState(),
    });

    callableClientsStats = {
      success: false,
      duration_ms: 0,
      row_count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      refreshed_at: new Date().toISOString(),
    };
  }

  // Finally refresh admin clients MV (independent, used for admin dashboard)
  // Note: We always try to refresh admin_clients MV even if others failed
  try {
    await adminClientsMVBreaker.execute(async () => {
      adminClientsStats = await refreshAdminClientsMV();
    });
  } catch (error) {
    console.error('[MVRefresh] Admin clients MV refresh failed, circuit breaker opened:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      circuitBreakerState: adminClientsMVBreaker.getState(),
    });

    adminClientsStats = {
      success: false,
      duration_ms: 0,
      row_count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      refreshed_at: new Date().toISOString(),
    };
  }

  console.log('[MVRefresh] Full refresh sequence completed:', {
    touchpoint_summary: touchpointSummaryStats.row_count,
    callable_clients: callableClientsStats.row_count,
    admin_clients: adminClientsStats.row_count,
    touchpoint_success: touchpointSummaryStats.success,
    callable_success: callableClientsStats.success,
    admin_success: adminClientsStats.success,
    total_duration_ms: touchpointSummaryStats.duration_ms + callableClientsStats.duration_ms + adminClientsStats.duration_ms,
  });

  return {
    touchpoint_summary: touchpointSummaryStats,
    callable_clients: callableClientsStats,
    admin_clients: adminClientsStats,
  };
}
