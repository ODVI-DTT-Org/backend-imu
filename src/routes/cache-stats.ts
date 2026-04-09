// src/routes/cache-stats.ts

/**
 * Cache Statistics Routes
 *
 * Admin-only endpoints for monitoring cache performance
 *
 * @file cache-stats.ts
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { getCacheService } from '../services/cache/redis-cache.js';
import { getCacheMetrics } from '../services/cache/metrics.js';

const cacheStats = new Hono();

// Apply authentication to all routes
cacheStats.use('/*', authMiddleware);

/**
 * GET /api/cache/stats
 * Get comprehensive cache statistics
 *
 * @returns { success: true, data: CacheStats } - Cache performance metrics
 * @throws 403 - Forbidden (admin only)
 *
 * Returns:
 * - metrics: Hit/miss/set/delete/error counts and rates
 * - redis: Redis memory usage, key count
 * - summary: Aggregated stats across all cache operations
 *
 * Requires admin role
 */
cacheStats.get('/stats', requireRole('admin'), async (c) => {
  const cache = getCacheService();
  const metrics = getCacheMetrics();

  // Get metrics summary
  const summary = metrics.getSummary();

  // Get all individual metrics
  const allMetrics = metrics.getAllMetrics();

  // Get Redis stats if cache is enabled
  const redisStats = cache.isEnabled()
    ? await cache.getStats()
    : {
        keyCount: 0,
        memoryUsage: '0B',
        hitRate: 0,
      };

  // Build detailed metrics response
  const detailedMetrics: Record<string, any> = {};
  allMetrics.forEach((stats, key) => {
    if (key !== '__global__') {
      detailedMetrics[key] = {
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hitRate,
        missRate: stats.missRate,
        totalRequests: stats.totalRequests,
      };
    }
  });

  return c.json({
    success: true,
    data: {
      summary: {
        hits: summary.hits,
        misses: summary.misses,
        hitRate: summary.hitRate,
        missRate: summary.missRate,
        totalRequests: summary.totalRequests,
        sets: summary.sets,
        deletes: summary.deletes,
        errors: summary.errors,
      },
      redis: {
        enabled: cache.isEnabled(),
        keyCount: redisStats.keyCount,
        memoryUsage: redisStats.memoryUsage,
      },
      byEndpoint: detailedMetrics,
    },
  });
});

/**
 * GET /api/cache/stats/summary
 * Get simplified cache statistics summary
 *
 * @returns { success: true, data: CacheSummary } - Simplified cache metrics
 * @throws 403 - Forbidden (admin only)
 *
 * Returns a simplified view of cache performance for quick monitoring
 *
 * Requires admin role
 */
cacheStats.get('/stats/summary', requireRole('admin'), async (c) => {
  const cache = getCacheService();
  const metrics = getCacheMetrics();

  const summary = metrics.getSummary();

  return c.json({
    success: true,
    data: {
      enabled: cache.isEnabled(),
      hitRate: summary.hitRate,
      missRate: summary.missRate,
      totalRequests: summary.totalRequests,
      totalHits: summary.hits,
      totalMisses: summary.misses,
    },
  });
});

/**
 * DELETE /api/cache
 * Clear all cache (use with caution!)
 *
 * @returns { success: true, message: string }
 * @throws 403 - Forbidden (admin only)
 *
 * Flushes all cached data from Redis. This will cause cache misses
 * until data is re-cached. Use sparingly in production.
 *
 * Requires admin role
 */
cacheStats.delete('/', requireRole('admin'), async (c) => {
  const cache = getCacheService();

  if (!cache.isEnabled()) {
    return c.json({
      success: false,
      message: 'Cache is not enabled',
    }, 400);
  }

  const flushed = await cache.flush();

  if (!flushed) {
    return c.json({
      success: false,
      message: 'Failed to flush cache',
    }, 500);
  }

  return c.json({
    success: true,
    message: 'Cache flushed successfully',
  });
});

export default cacheStats;
