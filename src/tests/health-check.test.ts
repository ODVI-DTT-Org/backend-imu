/**
 * Unit Tests for Health Check Service
 *
 * Tests for:
 * - Database health check
 * - Cache health check
 * - Materialized view health check
 * - Overall health status
 *
 * @file health-check.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getHealthStatus,
  getDatabaseHealth,
  getCacheHealth,
  getMVHealth,
  type HealthStatus,
  type DatabaseHealth,
  type CacheHealth,
  type MVHealth,
} from '../services/health-check.js';
import { pool } from '../db/index.js';
import { getCacheService } from '../services/cache/redis-cache.js';

// Mock database pool
vi.mock('../db/index.js', () => ({
  pool: {
    query: vi.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  },
}));

// Mock cache service
vi.mock('../services/cache/redis-cache.js', () => ({
  getCacheService: vi.fn(),
}));

describe('getDatabaseHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return healthy status when database is connected', async () => {
    vi.mocked(pool.query).mockImplementation(
      () => new Promise((resolve) =>
        setTimeout(() => resolve({ rows: [{ result: 1 }] }), 10)
      )
    );

    const health = await getDatabaseHealth();

    expect(health.status).toBe('healthy');
    expect(health.connectionPool.total).toBe(10);
    expect(health.connectionPool.idle).toBe(5);
    expect(health.connectionPool.waiting).toBe(0);
    expect(health.responseTime).toBeGreaterThanOrEqual(10);
    expect(pool.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('should return unhealthy status when database connection fails', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('Connection failed'));

    const health = await getDatabaseHealth();

    expect(health.status).toBe('unhealthy');
    expect(health.connectionPool.total).toBe(0);
    expect(health.connectionPool.idle).toBe(0);
    expect(health.connectionPool.waiting).toBe(0);
    expect(health.error).toBe('Connection failed');
  });

  it('should return unhealthy status when database times out', async () => {
    // Mock a rejection that happens immediately (simulating timeout behavior)
    vi.mocked(pool.query).mockRejectedValue(new Error('Database timeout'));

    const health = await getDatabaseHealth({ databaseTimeout: 1000 });

    expect(health.status).toBe('unhealthy');
    expect(health.error).toBe('Database timeout');
  });
});

describe('getCacheHealth', () => {
  const mockRedisClient = {
    ping: vi.fn(),
    info: vi.fn(),
    dbsize: vi.fn(),
  };

  const mockCacheService = {
    isEnabled: vi.fn(),
    getClient: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCacheService).mockReturnValue(mockCacheService as any);
  });

  it('should return healthy status when cache is disabled', async () => {
    mockCacheService.isEnabled.mockReturnValue(false);

    const health = await getCacheHealth();

    expect(health.status).toBe('healthy');
    expect(health.enabled).toBe(false);
    expect(health.connected).toBe(false);
  });

  it('should return healthy status when cache is enabled and connected', async () => {
    mockCacheService.isEnabled.mockReturnValue(true);
    mockCacheService.getClient.mockReturnValue(mockRedisClient);
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockRedisClient.info.mockImplementation((section: string) => {
      if (section === 'stats') {
        return 'keyspace_hits:1000\nkeyspace_misses:500';
      }
      if (section === 'memory') {
        return 'used_memory_human:100M\nused_memory_peak_human:120M\nmem_fragmentation_ratio:1.2';
      }
      return '';
    });
    mockRedisClient.dbsize.mockResolvedValue(5000);

    const health = await getCacheHealth();

    expect(health.status).toBe('healthy');
    expect(health.enabled).toBe(true);
    expect(health.connected).toBe(true);
    expect(health.hitRate).toBeCloseTo(66.67, 1);
    expect(health.memoryUsage?.used).toBe('100M');
    expect(health.memoryUsage?.peak).toBe('120M');
    expect(health.memoryUsage?.fragmentationRatio).toBe(1.2);
    expect(health.keyCount).toBe(5000);
  });

  it('should return degraded status when hit rate is low', async () => {
    mockCacheService.isEnabled.mockReturnValue(true);
    mockCacheService.getClient.mockReturnValue(mockRedisClient);
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockRedisClient.info.mockImplementation((section: string) => {
      if (section === 'stats') {
        return 'keyspace_hits:10\nkeyspace_misses:90';
      }
      if (section === 'memory') {
        return 'used_memory_human:100M\nused_memory_peak_human:120M\nmem_fragmentation_ratio:1.2';
      }
      return '';
    });
    mockRedisClient.dbsize.mockResolvedValue(5000);

    const health = await getCacheHealth();

    expect(health.status).toBe('degraded');
    expect(health.hitRate).toBe(10);
  });

  it('should return degraded status when fragmentation is high', async () => {
    mockCacheService.isEnabled.mockReturnValue(true);
    mockCacheService.getClient.mockReturnValue(mockRedisClient);
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockRedisClient.info.mockImplementation((section: string) => {
      if (section === 'stats') {
        return 'keyspace_hits:1000\nkeyspace_misses:500';
      }
      if (section === 'memory') {
        return 'used_memory_human:100M\nused_memory_peak_human:120M\nmem_fragmentation_ratio:1.6';
      }
      return '';
    });
    mockRedisClient.dbsize.mockResolvedValue(5000);

    const health = await getCacheHealth();

    expect(health.status).toBe('degraded');
    expect(health.memoryUsage?.fragmentationRatio).toBe(1.6);
  });

  it('should return unhealthy status when fragmentation is very high', async () => {
    mockCacheService.isEnabled.mockReturnValue(true);
    mockCacheService.getClient.mockReturnValue(mockRedisClient);
    mockRedisClient.ping.mockResolvedValue('PONG');
    mockRedisClient.info.mockImplementation((section: string) => {
      if (section === 'stats') {
        return 'keyspace_hits:1000\nkeyspace_misses:500';
      }
      if (section === 'memory') {
        return 'used_memory_human:100M\nused_memory_peak_human:120M\nmem_fragmentation_ratio:2.5';
      }
      return '';
    });
    mockRedisClient.dbsize.mockResolvedValue(5000);

    const health = await getCacheHealth();

    expect(health.status).toBe('unhealthy');
    expect(health.memoryUsage?.fragmentationRatio).toBe(2.5);
  });

  it('should return unhealthy status when ping fails', async () => {
    mockCacheService.isEnabled.mockReturnValue(true);
    mockCacheService.getClient.mockReturnValue(mockRedisClient);
    mockRedisClient.ping.mockResolvedValue(null);

    const health = await getCacheHealth();

    expect(health.status).toBe('unhealthy');
    expect(health.enabled).toBe(true);
    expect(health.connected).toBe(false);
    expect(health.error).toBe('Ping failed');
  });

  it('should return unhealthy status when cache throws error', async () => {
    mockCacheService.isEnabled.mockReturnValue(true);
    mockCacheService.getClient.mockReturnValue(mockRedisClient);
    mockRedisClient.ping.mockRejectedValue(new Error('Redis connection error'));

    const health = await getCacheHealth();

    expect(health.status).toBe('unhealthy');
    expect(health.enabled).toBe(true);
    expect(health.connected).toBe(false);
    expect(health.error).toBe('Redis connection error');
  });
});

describe('getMVHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return healthy status when both MVs are fresh', async () => {
    vi.mocked(pool.query).mockImplementation((query: string) => {
      if (query.includes('information_schema.tables')) {
        return Promise.resolve({ rows: [{ exists: true }] });
      }
      if (query.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '100000' }] });
      }
      if (query.includes('MAX(updated_at)')) {
        return Promise.resolve({
          rows: [{ last_refresh: new Date(Date.now() - 5 * 60 * 1000).toISOString() }], // 5 minutes ago
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const health = await getMVHealth();

    expect(health.status).toBe('healthy');
    expect(health.views.touchpointSummary.exists).toBe(true);
    expect(health.views.touchpointSummary.rowCount).toBe(100000);
    expect(health.views.touchpointSummary.status).toBe('fresh');
    expect(health.views.callableClients.exists).toBe(true);
    expect(health.views.callableClients.rowCount).toBe(100000);
    expect(health.views.callableClients.status).toBe('fresh');
  });

  it('should return degraded status when MVs are stale', async () => {
    vi.mocked(pool.query).mockImplementation((query: string) => {
      if (query.includes('information_schema.tables')) {
        return Promise.resolve({ rows: [{ exists: true }] });
      }
      if (query.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '100000' }] });
      }
      if (query.includes('MAX(updated_at)')) {
        return Promise.resolve({
          rows: [{ last_refresh: new Date(Date.now() - 20 * 60 * 1000).toISOString() }], // 20 minutes ago
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const health = await getMVHealth({ mvMaxAge: 15 });

    expect(health.status).toBe('degraded');
    expect(health.views.touchpointSummary.exists).toBe(true);
    expect(health.views.touchpointSummary.status).toBe('stale');
    expect(health.views.touchpointSummary.age).toBeCloseTo(20, 0);
  });

  it('should return unhealthy status when MVs do not exist', async () => {
    vi.mocked(pool.query).mockImplementation((query: string) => {
      if (query.includes('information_schema.tables')) {
        return Promise.resolve({ rows: [{ exists: false }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const health = await getMVHealth();

    expect(health.status).toBe('unhealthy');
    expect(health.views.touchpointSummary.exists).toBe(false);
    expect(health.views.touchpointSummary.status).toBe('error');
  });

  it('should handle missing updated_at column gracefully', async () => {
    vi.mocked(pool.query).mockImplementation((query: string) => {
      if (query.includes('information_schema.tables')) {
        return Promise.resolve({ rows: [{ exists: true }] });
      }
      if (query.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '100000' }] });
      }
      if (query.includes('MAX(updated_at)')) {
        return Promise.reject(new Error('Column does not exist'));
      }
      return Promise.resolve({ rows: [] });
    });

    const health = await getMVHealth();

    expect(health.status).toBe('healthy'); // Still healthy if MV exists and has data
    expect(health.views.touchpointSummary.exists).toBe(true);
    expect(health.views.touchpointSummary.rowCount).toBe(100000);
    expect(health.views.touchpointSummary.lastRefresh).toBeUndefined();
  });
});

describe('getHealthStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return healthy status when all checks pass', async () => {
    // Mock database with different responses for different queries
    vi.mocked(pool.query).mockImplementation((query: string) => {
      if (query === 'SELECT 1') {
        return Promise.resolve({ rows: [{ result: 1 }] });
      }
      if (query.includes('information_schema.tables')) {
        return Promise.resolve({ rows: [{ exists: true }] });
      }
      if (query.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '100000' }] });
      }
      if (query.includes('MAX(updated_at)')) {
        return Promise.resolve({
          rows: [{ last_refresh: new Date(Date.now() - 5 * 60 * 1000).toISOString() }], // 5 minutes ago
        });
      }
      return Promise.resolve({ rows: [] });
    });

    // Mock cache
    const mockCacheService = {
      isEnabled: vi.fn().mockReturnValue(true),
      getClient: vi.fn().mockReturnValue({
        ping: vi.fn().mockResolvedValue('PONG'),
        info: vi.fn().mockImplementation((section: string) => {
          if (section === 'stats') {
            return 'keyspace_hits:1000\nkeyspace_misses:500';
          }
          if (section === 'memory') {
            return 'used_memory_human:100M\nused_memory_peak_human:120M\nmem_fragmentation_ratio:1.2';
          }
          return '';
        }),
        dbsize: vi.fn().mockResolvedValue(5000),
      }),
    };
    vi.mocked(getCacheService).mockReturnValue(mockCacheService as any);

    const status = await getHealthStatus();

    expect(status.status).toBe('healthy');
    expect(status.checks.database.status).toBe('healthy');
    expect(status.checks.cache.status).toBe('healthy');
    expect(status.checks.materializedViews.status).toBe('healthy');
    expect(status.uptime).toBeGreaterThan(0);
    expect(new Date(status.timestamp)).toBeInstanceOf(Date);
  });

  it('should return degraded status when some checks are degraded', async () => {
    // Mock database with different responses for different queries
    vi.mocked(pool.query).mockImplementation((query: string) => {
      if (query === 'SELECT 1') {
        return Promise.resolve({ rows: [{ result: 1 }] });
      }
      if (query.includes('information_schema.tables')) {
        return Promise.resolve({ rows: [{ exists: true }] });
      }
      if (query.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '100000' }] });
      }
      if (query.includes('MAX(updated_at)')) {
        return Promise.resolve({
          rows: [{ last_refresh: new Date(Date.now() - 5 * 60 * 1000).toISOString() }], // 5 minutes ago
        });
      }
      return Promise.resolve({ rows: [] });
    });

    // Mock cache with low hit rate
    const mockCacheService = {
      isEnabled: vi.fn().mockReturnValue(true),
      getClient: vi.fn().mockReturnValue({
        ping: vi.fn().mockResolvedValue('PONG'),
        info: vi.fn().mockImplementation((section: string) => {
          if (section === 'stats') {
            return 'keyspace_hits:10\nkeyspace_misses:90';
          }
          if (section === 'memory') {
            return 'used_memory_human:100M\nused_memory_peak_human:120M\nmem_fragmentation_ratio:1.2';
          }
          return '';
        }),
        dbsize: vi.fn().mockResolvedValue(5000),
      }),
    };
    vi.mocked(getCacheService).mockReturnValue(mockCacheService as any);

    const status = await getHealthStatus();

    expect(status.status).toBe('degraded');
    expect(status.checks.database.status).toBe('healthy');
    expect(status.checks.cache.status).toBe('degraded');
  });

  it('should return unhealthy status when critical checks fail', async () => {
    // Mock database failure
    vi.mocked(pool.query).mockRejectedValue(new Error('Database error'));

    // Mock cache failure
    const mockCacheService = {
      isEnabled: vi.fn().mockReturnValue(true),
      getClient: vi.fn().mockReturnValue({
        ping: vi.fn().mockRejectedValue(new Error('Redis error')),
        info: vi.fn(),
        dbsize: vi.fn(),
      }),
    };
    vi.mocked(getCacheService).mockReturnValue(mockCacheService as any);

    const status = await getHealthStatus();

    expect(status.status).toBe('unhealthy');
    expect(status.checks.database.status).toBe('unhealthy');
    expect(status.checks.cache.status).toBe('unhealthy');
  });

  it('should use custom config when provided', async () => {
    // Mock database error
    vi.mocked(pool.query).mockRejectedValue(new Error('Database timeout'));

    const status = await getHealthStatus({ databaseTimeout: 1000 });

    expect(status.checks.database.status).toBe('unhealthy');
    expect(status.checks.database.error).toBe('Database timeout');
  });
});
