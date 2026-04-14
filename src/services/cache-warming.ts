// src/services/cache-warming.ts

/**
 * Cache Warming Service
 *
 * Pre-populates Redis cache with assigned client IDs for all users
 * Runs daily at 6:00 AM to ensure cache is warm before users start their day
 *
 * Part of Redis caching implementation
 *
 * @file cache-warming.ts
 */

import { pool } from '../db/index.js';
import { getClientsCacheService } from './cache/clients-cache.js';

/**
 * Cache warming statistics
 */
export interface CacheWarmingStats {
  total_users: number;
  processed_users: number;
  successful_warms: number;
  failed_warms: number;
  total_client_ids_cached: number;
  duration_ms: number;
  errors: Array<{
    user_id: string;
    error: string;
  }>;
}

/**
 * Warm the cache for a single user
 * @param userId - User ID to warm cache for
 * @returns Number of client IDs cached, or null if failed
 */
async function warmUserCache(userId: string): Promise<number | null> {
  try {
    // Get user's assigned areas
    const areasResult = await pool.query(
      `SELECT DISTINCT province, municipality
       FROM user_locations
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (areasResult.rows.length === 0) {
      // User has no assigned areas, nothing to warm
      return 0;
    }

    const areas = areasResult.rows.map(row => `${row.province}:${row.municipality}`);

    // Build area filter for query
    const areaConditions = areasResult.rows.map((row, index) => {
      return `(c.province = $${index * 2 + 1} AND c.municipality = $${index * 2 + 2})`;
    }).join(' OR ');

    const areaParams = areasResult.rows.flatMap(row => [row.province, row.municipality]);

    // Get assigned client IDs using the materialized view
    const clientsResult = await pool.query(
      `SELECT DISTINCT mv.client_id
       FROM client_touchpoint_summary_mv mv
       INNER JOIN clients c ON c.id = mv.client_id
       WHERE c.deleted_at IS NULL
         AND (${areaConditions})`,
      areaParams
    );

    const clientIds = clientsResult.rows.map(row => row.client_id);

    // Store in cache
    const clientsCache = getClientsCacheService();
    await clientsCache.setAssignedClientIds(userId, clientIds, areas);

    return clientIds.length;
  } catch (error) {
    console.error(`[CacheWarming] Failed to warm cache for user ${userId}:`, error);
    return null;
  }
}

/**
 * Warm cache for all Caravan and Tele users
 * Called by the scheduled background job
 * @returns Cache warming statistics
 */
export async function warmAllAssignedClientsCache(): Promise<CacheWarmingStats> {
  const startTime = Date.now();
  const stats: CacheWarmingStats = {
    total_users: 0,
    processed_users: 0,
    successful_warms: 0,
    failed_warms: 0,
    total_client_ids_cached: 0,
    duration_ms: 0,
    errors: [],
  };

  try {
    // Get all Caravan and Tele users
    const usersResult = await pool.query(
      `SELECT id, email, first_name, last_name, role
       FROM users
       WHERE role IN ('caravan', 'tele')
         AND deleted_at IS NULL
         AND status = 'active'`
    );

    stats.total_users = usersResult.rows.length;

    console.log(`[CacheWarming] Starting cache warming for ${stats.total_users} users`);

    // Warm cache for each user
    for (const user of usersResult.rows) {
      stats.processed_users++;

      const result = await warmUserCache(user.id);

      if (result !== null) {
        stats.successful_warms++;
        stats.total_client_ids_cached += result;
        console.debug(`[CacheWarming] Warmed cache for ${user.email}: ${result} client IDs`);
      } else {
        stats.failed_warms++;
        stats.errors.push({
          user_id: user.id,
          error: 'Unknown error',
        });
      }
    }

    stats.duration_ms = Date.now() - startTime;

    console.log(`[CacheWarming] Cache warming complete:`, {
      total_users: stats.total_users,
      successful_warms: stats.successful_warms,
      failed_warms: stats.failed_warms,
      total_client_ids_cached: stats.total_client_ids_cached,
      duration_ms: stats.duration_ms,
    });

    return stats;
  } catch (error) {
    stats.duration_ms = Date.now() - startTime;
    console.error('[CacheWarming] Cache warming failed:', error);
    throw error;
  }
}

/**
 * Warm cache for a specific user on-demand
 * Useful for testing or manual cache warming
 * @param userId - User ID to warm cache for
 * @returns Number of client IDs cached
 */
export async function warmUserCacheOnDemand(userId: string): Promise<number> {
  console.log(`[CacheWarming] On-demand cache warming for user ${userId}`);

  const result = await warmUserCache(userId);

  if (result === null) {
    throw new Error('Failed to warm cache for user');
  }

  console.log(`[CacheWarming] Warmed cache for user ${userId}: ${result} client IDs`);
  return result;
}
