// src/services/health-check.ts

/**
 * Health Check Service
 *
 * Provides comprehensive health status for:
 * - Database connection
 * - Redis cache status
 * - Materialized view refresh status
 * - Overall system health
 *
 * @file health-check.ts
 */

import { pool } from '../db/index.js';
import { getCacheService } from './cache/redis-cache.js';

/**
 * Health status response
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: DatabaseHealth;
    cache: CacheHealth;
    materializedViews: MVHealth;
  };
}

/**
 * Database health status
 */
export interface DatabaseHealth {
  status: 'healthy' | 'unhealthy';
  connectionPool: {
    total: number;
    idle: number;
    waiting: number;
  };
  responseTime?: number; // ms
  error?: string;
}

/**
 * Cache health status
 */
export interface CacheHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  enabled: boolean;
  connected: boolean;
  hitRate?: number; // percentage
  memoryUsage?: {
    used: string;
    peak: string;
    fragmentationRatio: number;
  };
  keyCount?: number;
  error?: string;
}

/**
 * Materialized view health status
 */
export interface MVHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  views: {
    touchpointSummary: MVStatus;
    callableClients: MVStatus;
  };
  lastRefresh?: {
    touchpointSummary: string;
    callableClients: string;
  };
}

/**
 * Individual MV status
 */
export interface MVStatus {
  exists: boolean;
  rowCount?: number;
  lastRefresh?: string;
  age?: number; // minutes
  status: 'fresh' | 'stale' | 'error';
}

/**
 * Health check configuration
 */
interface HealthCheckConfig {
  databaseTimeout?: number; // ms
  cacheTimeout?: number; // ms
  mvMaxAge?: number; // minutes - consider MV stale if older than this
}

const DEFAULT_CONFIG: HealthCheckConfig = {
  databaseTimeout: 5000,
  cacheTimeout: 2000,
  mvMaxAge: 15, // 15 minutes
};

/**
 * Check database health
 */
async function checkDatabase(config: HealthCheckConfig): Promise<DatabaseHealth> {
  const startTime = Date.now();

  try {
    // Simple query to check connection
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database timeout')), config.databaseTimeout)
      ),
    ]);

    const responseTime = Date.now() - startTime;

    // Get connection pool stats
    const poolStatus = pool.totalCount > 0 ? {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    } : {
      total: 0,
      idle: 0,
      waiting: 0,
    };

    return {
      status: 'healthy',
      connectionPool: poolStatus,
      responseTime,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connectionPool: {
        total: 0,
        idle: 0,
        waiting: 0,
      },
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

/**
 * Check cache health
 */
async function checkCache(config: HealthCheckConfig): Promise<CacheHealth> {
  try {
    const cache = getCacheService();

    // Check if cache is enabled
    if (!cache.isEnabled()) {
      return {
        status: 'healthy',
        enabled: false,
        connected: false,
      };
    }

    // Check connection with ping
    const client = cache.getClient();
    const pingResult = await Promise.race<string | null>([
      client.ping(),
      new Promise<string | null>((_, reject) =>
        setTimeout(() => reject(new Error('Cache timeout')), config.cacheTimeout)
      ),
    ]);

    const connected = pingResult === 'PONG';

    if (!connected) {
      return {
        status: 'unhealthy',
        enabled: true,
        connected: false,
        error: 'Ping failed',
      };
    }

    // Get cache stats
    const info = await client.info('stats');
    const memory = await client.info('memory');
    const keyCount = await client.dbsize();

    // Parse hit rate from INFO stats
    const keyspaceHits = info.match(/keyspace_hits:(\d+)/)?.[1] || '0';
    const keyspaceMisses = info.match(/keyspace_misses:(\d+)/)?.[1] || '0';
    const hits = parseInt(keyspaceHits);
    const misses = parseInt(keyspaceMisses);
    const hitRate = hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0;

    // Parse memory info
    const usedMemory = memory.match(/used_memory_human:(.+)/)?.[1] || '0B';
    const peakMemory = memory.match(/used_memory_peak_human:(.+)/)?.[1] || '0B';
    const fragmentationRatio = parseFloat(memory.match(/mem_fragmentation_ratio:([\d.]+)/)?.[1] || '1.0');

    // Determine health status based on metrics
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (hitRate < 50) {
      status = 'degraded'; // Low cache hit rate
    }
    if (fragmentationRatio > 1.5) {
      status = 'degraded'; // High memory fragmentation
    }
    if (fragmentationRatio > 2.0) {
      status = 'unhealthy'; // Very high fragmentation
    }

    return {
      status,
      enabled: true,
      connected: true,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage: {
        used: usedMemory,
        peak: peakMemory,
        fragmentationRatio,
      },
      keyCount,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      enabled: true,
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown cache error',
    };
  }
}

/**
 * Check materialized view health
 */
async function checkMV(config: HealthCheckConfig): Promise<MVHealth> {
  try {
    // Check touchpoint summary MV
    const touchpointSummary = await checkSingleMV(
      'client_touchpoint_summary_mv',
      config.mvMaxAge || 15
    );

    // Check callable clients MV
    const callableClients = await checkSingleMV(
      'callable_clients_mv',
      config.mvMaxAge || 15
    );

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (touchpointSummary.status === 'stale' || callableClients.status === 'stale') {
      status = 'degraded';
    }
    if (touchpointSummary.status === 'error' || callableClients.status === 'error') {
      status = 'unhealthy';
    }

    return {
      status,
      views: {
        touchpointSummary,
        callableClients,
      },
      lastRefresh: {
        touchpointSummary: touchpointSummary.lastRefresh || 'N/A',
        callableClients: callableClients.lastRefresh || 'N/A',
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      views: {
        touchpointSummary: {
          exists: false,
          status: 'error',
        },
        callableClients: {
          exists: false,
          status: 'error',
        },
      },
    };
  }
}

/**
 * Check a single materialized view
 */
async function checkSingleMV(
  mvName: string,
  maxAgeMinutes: number
): Promise<MVStatus> {
  try {
    // Check if MV exists
    const existsResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = $1
      ) as exists
    `, [mvName]);

    const exists = existsResult.rows[0].exists;

    if (!exists) {
      return {
        exists: false,
        status: 'error',
      };
    }

    // Get row count
    const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${mvName}`);
    const rowCount = parseInt(countResult.rows[0].count);

    // Get last refresh time (if updated_at column exists)
    let lastRefresh: string | undefined;
    let age: number | undefined;

    try {
      const refreshResult = await pool.query(`
        SELECT MAX(updated_at) as last_refresh FROM ${mvName}
      `);

      if (refreshResult.rows[0].last_refresh) {
        lastRefresh = refreshResult.rows[0].last_refresh;
        const refreshTime = new Date(refreshResult.rows[0].last_refresh);
        age = (Date.now() - refreshTime.getTime()) / (1000 * 60); // minutes
      }
    } catch {
      // updated_at column might not exist
      lastRefresh = undefined;
      age = undefined;
    }

    // Determine status
    let status: 'fresh' | 'stale' | 'error' = 'fresh';
    if (age !== undefined && age > maxAgeMinutes) {
      status = 'stale';
    }

    return {
      exists: true,
      rowCount,
      lastRefresh,
      age,
      status,
    };
  } catch (error) {
    return {
      exists: false,
      status: 'error',
    };
  }
}

/**
 * Get overall health status
 */
export async function getHealthStatus(
  config: HealthCheckConfig = {}
): Promise<HealthStatus> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  // Run all checks in parallel
  const [database, cache, materializedViews] = await Promise.all([
    checkDatabase(mergedConfig),
    checkCache(mergedConfig),
    checkMV(mergedConfig),
  ]);

  // Determine overall status
  const allChecks = [database, cache, materializedViews];
  const hasUnhealthy = allChecks.some((c) => c.status === 'unhealthy');
  const hasDegraded = allChecks.some((c) => c.status === 'degraded');

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (hasUnhealthy) {
    overallStatus = 'unhealthy';
  } else if (hasDegraded) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database,
      cache,
      materializedViews,
    },
  };
}

/**
 * Get database health only
 */
export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  return checkDatabase(DEFAULT_CONFIG);
}

/**
 * Get cache health only
 */
export async function getCacheHealth(): Promise<CacheHealth> {
  return checkCache(DEFAULT_CONFIG);
}

/**
 * Get MV health only
 */
export async function getMVHealth(): Promise<MVHealth> {
  return checkMV(DEFAULT_CONFIG);
}
