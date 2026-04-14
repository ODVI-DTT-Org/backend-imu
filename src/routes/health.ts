// src/routes/health.ts

/**
 * Health Check API Routes
 *
 * Provides endpoints for monitoring system health:
 * - GET /api/health - Overall health status
 * - GET /api/health/database - Database health
 * - GET /api/health/cache - Cache health
 * - GET /api/health/mv - Materialized view health
 *
 * @file health.ts
 */

import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import {
  getHealthStatus,
  getDatabaseHealth,
  getCacheHealth,
  getMVHealth,
} from '../services/health-check.js';

const health = new Hono();

/**
 * GET /api/health
 *
 * Get overall system health status
 *
 * Requires: Admin role
 */
health.get('/', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const status = await getHealthStatus();

    // Return appropriate HTTP status based on health
    const httpStatus =
      status.status === 'healthy' ? 200 :
      status.status === 'degraded' ? 200 : // Still return 200 for degraded, but check status field
      503; // Service Unavailable for unhealthy

    return c.json(status, httpStatus);
  } catch (error) {
    console.error('[Health] Error getting health status:', error);
    return c.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      503
    );
  }
});

/**
 * GET /api/health/database
 *
 * Get database health status
 *
 * Requires: Admin role
 */
health.get('/database', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const health = await getDatabaseHealth();

    const httpStatus = health.status === 'healthy' ? 200 : 503;

    return c.json(health, httpStatus);
  } catch (error) {
    console.error('[Health] Error getting database health:', error);
    return c.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      503
    );
  }
});

/**
 * GET /api/health/cache
 *
 * Get cache (Redis) health status
 *
 * Requires: Admin role
 */
health.get('/cache', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const health = await getCacheHealth();

    const httpStatus =
      health.status === 'healthy' || health.status === 'degraded' ? 200 : 503;

    return c.json(health, httpStatus);
  } catch (error) {
    console.error('[Health] Error getting cache health:', error);
    return c.json(
      {
        status: 'unhealthy',
        enabled: false,
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      503
    );
  }
});

/**
 * GET /api/health/mv
 *
 * Get materialized view health status
 *
 * Requires: Admin role
 */
health.get('/mv', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const health = await getMVHealth();

    const httpStatus =
      health.status === 'healthy' || health.status === 'degraded' ? 200 : 503;

    return c.json(health, httpStatus);
  } catch (error) {
    console.error('[Health] Error getting MV health:', error);
    return c.json(
      {
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
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      503
    );
  }
});

/**
 * GET /api/health/ready
 *
 * Readiness probe - returns 200 if system is ready to accept requests
 * Does not require authentication (for Kubernetes probes)
 */
health.get('/ready', async (c) => {
  try {
    // Quick check: database connection only
    const dbHealth = await getDatabaseHealth();

    if (dbHealth.status === 'healthy') {
      return c.json({ status: 'ready' }, 200);
    }

    return c.json({ status: 'not_ready', reason: 'database_unhealthy' }, 503);
  } catch (error) {
    return c.json(
      {
        status: 'not_ready',
        reason: error instanceof Error ? error.message : 'Unknown error',
      },
      503
    );
  }
});

/**
 * GET /api/health/live
 *
 * Liveness probe - returns 200 if service is alive
 * Does not require authentication (for Kubernetes probes)
 */
health.get('/live', async (c) => {
  return c.json({ status: 'alive' }, 200);
});

export default health;
