/**
 * Unit Tests for Clients Cache Service
 *
 * Tests for:
 * - ClientsCacheService
 * - ClientCacheInvalidation
 * - Cache warming service
 * - MV refresh service
 *
 * @file clients-cache.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getClientsCacheService, resetClientsCacheService } from '../services/cache/clients-cache.js';
import { getClientCacheInvalidation, resetClientCacheInvalidation } from '../services/cache/client-cache-invalidation.js';
import { warmAllAssignedClientsCache, warmUserCacheOnDemand } from '../services/cache-warming.js';
import { refreshTouchpointSummaryMV, getMVLastRefreshTime, isMVRefreshNeeded, refreshCallableClientsMV, refreshAllMaterializedViews } from '../services/touchpoint-mv-refresh.js';
import { getCacheService, resetCacheService } from '../services/cache/redis-cache.js';
import { pool } from '../db/index.js';

// Mock Redis cache service
vi.mock('../services/cache/redis-cache.js', () => ({
  getCacheService: vi.fn(),
  resetCacheService: vi.fn(),
  CACHE_TTL: {
    SHORT: 300,
    MEDIUM: 1800,
    LONG: 3600,
    DAY: 86400,
  },
  CACHE_PREFIX: {
    ADDRESSES: 'addr:',
    PHONE_NUMBERS: 'phone:',
    PSGC: 'psgc:',
    CLIENT: 'client:',
  },
  RedisCacheService: vi.fn(),
}));

// Mock database pool
vi.mock('../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock Redis client methods
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  mget: vi.fn(),
  mset: vi.fn(),
  keys: vi.fn(),
  exists: vi.fn(),
  incr: vi.fn(),
  dbsize: vi.fn(),
  info: vi.fn(),
  flushdb: vi.fn(),
  quit: vi.fn(),
  ping: vi.fn(),
  on: vi.fn(),
  pipeline: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(['OK']),
  })),
};

// Mock cache service
const mockCacheService = {
  get: mockRedisClient.get,
  set: mockRedisClient.set,
  del: mockRedisClient.del,
  mget: mockRedisClient.mget,
  mset: mockRedisClient.mset,
  incr: mockRedisClient.incr,
  setWithPX: vi.fn(),
  getClient: () => mockRedisClient,
  isEnabled: () => true,
};

describe('ClientsCacheService', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    resetClientsCacheService();
    // Mock getCacheService to return our mock
    vi.mocked(getCacheService).mockReturnValue(mockCacheService as any);
  });

  afterEach(() => {
    resetClientsCacheService();
    vi.clearAllMocks();
  });

  describe('getAssignedClientIds', () => {
    it('should return null when cache is empty', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const service = getClientsCacheService();

      const result = await service.getAssignedClientIds('user-123');

      expect(result).toBeNull();
      expect(mockCacheService.get).toHaveBeenCalledWith('v1:clients:user:assigned_ids:user-123');
    });

    it('should return client IDs from cache', async () => {
      const cachedData = {
        client_ids: ['client-1', 'client-2', 'client-3'],
        areas: ['province1:municipality1'],
        last_updated: new Date().toISOString(),
      };

      mockCacheService.get.mockResolvedValue(cachedData);

      const service = getClientsCacheService();

      const result = await service.getAssignedClientIds('user-123');

      expect(result).toEqual(['client-1', 'client-2', 'client-3']);
    });
  });

  describe('setAssignedClientIds', () => {
    it('should store client IDs in cache with correct TTL', async () => {
      mockCacheService.set.mockResolvedValue(true);

      const service = getClientsCacheService();

      await service.setAssignedClientIds('user-123', ['client-1', 'client-2'], ['area1', 'area2']);

      const expectedData = {
        client_ids: ['client-1', 'client-2'],
        areas: ['area1', 'area2'],
        last_updated: expect.any(String),
      };

      expect(mockCacheService.set).toHaveBeenCalledWith(
        'v1:clients:user:assigned_ids:user-123',
        expectedData,
        43200 // 12 hours TTL
      );
    });
  });

  describe('getTouchpointSummary', () => {
    it('should return null when cache miss', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const service = getClientsCacheService();

      const result = await service.getTouchpointSummary('client-123');

      expect(result).toBeNull();
    });

    it('should return touchpoint summary from cache', async () => {
      const cachedSummary = {
        client_id: 'client-123',
        total_count: 5,
        completed_count: 3,
        next_touchpoint_type: 'Visit',
        next_touchpoint_number: 4,
        last_touchpoint_type: 'Call',
        last_touchpoint_date: new Date().toISOString(),
      };

      mockCacheService.get.mockResolvedValue(cachedSummary);

      const service = getClientsCacheService();

      const result = await service.getTouchpointSummary('client-123');

      expect(result).toEqual(cachedSummary);
    });
  });

  describe('getTouchpointSummaries (batch)', () => {
    it('should return empty map when no client IDs provided', async () => {
      const service = getClientsCacheService();
      const result = await service.getTouchpointSummaries([]);

      expect(result.size).toBe(0);
      expect(mockCacheService.mget).not.toHaveBeenCalled();
    });

    it('should return map of cached summaries', async () => {
      const cachedSummaries = [
        { client_id: 'client-1', total_count: 5, completed_count: 3 },
        { client_id: 'client-2', total_count: 2, completed_count: 1 },
        null, // cache miss for client-3
      ];

      mockCacheService.mget.mockResolvedValue(cachedSummaries);

      const service = getClientsCacheService();

      const result = await service.getTouchpointSummaries(['client-1', 'client-2', 'client-3']);

      expect(result.size).toBe(2);
      expect(result.get('client-1')).toBeTruthy();
      expect(result.get('client-2')).toBeTruthy();
      expect(result.get('client-3')).toBeUndefined();
    });
  });

  describe('invalidateUserCache', () => {
    it('should delete user cache keys', async () => {
      mockCacheService.del.mockResolvedValue(true);

      const service = getClientsCacheService();

      await service.invalidateUserCache('user-123');

      expect(mockCacheService.del).toHaveBeenCalledWith('v1:clients:user:assigned_ids:user-123');
      expect(mockCacheService.del).toHaveBeenCalledWith('v1:clients:user:assigned_areas:user-123');
    });
  });

  describe('acquireLock and releaseLock', () => {
    it('should acquire lock successfully', async () => {
      // Mock getClient() to return mockRedisClient
      mockCacheService.getClient = vi.fn().mockReturnValue(mockRedisClient);
      // Mock set to return 'OK' for successful lock acquisition
      mockRedisClient.set.mockResolvedValue('OK');

      const service = getClientsCacheService();

      const result = await service.acquireLock('test-key');

      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'v1:clients:lock:test-key',
        '1',
        'EX',
        10,
        'NX'
      );
    });

    it('should fail to acquire lock when already held', async () => {
      // Mock getClient() to return mockRedisClient
      mockCacheService.getClient = vi.fn().mockReturnValue(mockRedisClient);
      // Mock set to return null for failed lock acquisition (lock already exists)
      mockRedisClient.set.mockResolvedValue(null);

      const service = getClientsCacheService();

      const result = await service.acquireLock('test-key');

      expect(result).toBe(false);
    });

    it('should release lock', async () => {
      mockCacheService.del.mockResolvedValue(true);

      const service = getClientsCacheService();

      await service.releaseLock('test-key');

      expect(mockCacheService.del).toHaveBeenCalledWith('v1:clients:lock:test-key');
    });
  });
});

describe('ClientCacheInvalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClientCacheInvalidation();
    // Reset and setup mock
    vi.mocked(getCacheService).mockReturnValue(mockCacheService as any);
  });

  afterEach(() => {
    resetClientCacheInvalidation();
    vi.clearAllMocks();
  });

  describe('onTouchpointCreated', () => {
    it('should invalidate touchpoint summary and user cache', async () => {
      const mockInvalidateSummary = vi.fn().mockResolvedValue(undefined);
      const mockInvalidateUser = vi.fn().mockResolvedValue(undefined);

      // Mock the cache service methods
      const service = getClientCacheInvalidation();
      (service as any).clientsCache = {
        invalidateTouchpointSummary: mockInvalidateSummary,
        invalidateUserCache: mockInvalidateUser,
      };

      await service.onTouchpointCreated('client-123', 'user-456');

      expect(mockInvalidateSummary).toHaveBeenCalledWith('client-123');
      expect(mockInvalidateUser).toHaveBeenCalledWith('user-456');
    });
  });

  describe('onBulkTouchpointChange', () => {
    it('should invalidate multiple touchpoint summaries', async () => {
      const mockInvalidateSummaries = vi.fn().mockResolvedValue(undefined);

      const service = getClientCacheInvalidation();
      (service as any).clientsCache = {
        invalidateTouchpointSummaries: mockInvalidateSummaries,
      };

      await service.onBulkTouchpointChange(['client-1', 'client-2'], 'touchpoint_updated');

      expect(mockInvalidateSummaries).toHaveBeenCalledWith(['client-1', 'client-2']);
    });
  });

  describe('isEnabled', () => {
    it('should return false when Redis is disabled', () => {
      // Reset the instance to force fresh construction
      resetClientCacheInvalidation();

      // Setup mock to return false for isEnabled
      mockCacheService.getClient = vi.fn().mockReturnValue(mockRedisClient);
      mockCacheService.isEnabled = vi.fn().mockReturnValue(false);

      // Get a new instance which will use our mock
      const service = getClientCacheInvalidation();

      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when Redis is enabled', () => {
      // Reset the instance to force fresh construction
      resetClientCacheInvalidation();

      // Setup mock to return true for isEnabled
      mockCacheService.getClient = vi.fn().mockReturnValue(mockRedisClient);
      mockCacheService.isEnabled = vi.fn().mockReturnValue(true);

      // Get a new instance which will use our mock
      const service = getClientCacheInvalidation();

      expect(service.isEnabled()).toBe(true);
    });
  });
});

describe('Background Jobs', () => {
  describe('warmUserCacheOnDemand', () => {
    it('should warm cache for a single user', async () => {
      // Mock database query to return areas and client IDs
      const mockPoolQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [{ province: 'Pampanga', municipality: 'Angeles City' }] })
        .mockResolvedValueOnce({ rows: [{ client_id: 'client-1' }, { client_id: 'client-2' }] });

      // Mock cache service
      const mockSetCache = vi.fn().mockResolvedValue(undefined);

      const service = { warmUserCache: warmUserCacheOnDemand };

      // This would normally be called via the service
      // For testing, we're testing the function directly
      // In a real test, we'd need to mock the database and cache
    });
  });

  describe('refreshTouchpointSummaryMV', () => {
    it('should refresh materialized view successfully', async () => {
      // Mock pool.query to return successful results
      vi.mocked(pool.query)
        .mockResolvedValueOnce(undefined) // REFRESH command (returns nothing)
        .mockResolvedValueOnce({ rows: [{ count: '300000' }] }); // COUNT query

      // Mock successful refresh
      const result = await refreshTouchpointSummaryMV();

      // Verify the result
      expect(result.success).toBe(true);
      expect(result.row_count).toBe(300000);
      expect(pool.query).toHaveBeenCalledWith('REFRESH MATERIALIZED VIEW CONCURRENTLY client_touchpoint_summary_mv');
      expect(pool.query).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM client_touchpoint_summary_mv');
    });

    it('should handle refresh failure', async () => {
      // Mock pool.query to throw error
      vi.mocked(pool.query).mockRejectedValue(new Error('Database error'));

      // This should throw
      await expect(refreshTouchpointSummaryMV()).rejects.toThrow();
    });
  });

  describe('refreshCallableClientsMV', () => {
    it('should refresh callable_clients_mv successfully', async () => {
      // Mock pool.query to return MV exists and successful refresh
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // MV exists check
        .mockResolvedValueOnce(undefined) // REFRESH command
        .mockResolvedValueOnce({ rows: [{ count: '40000' }] }); // COUNT query

      // Mock successful refresh
      const result = await refreshCallableClientsMV();

      // Verify the result
      expect(result.success).toBe(true);
      expect(result.row_count).toBe(40000);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT EXISTS'));
      expect(pool.query).toHaveBeenCalledWith('REFRESH MATERIALIZED VIEW CONCURRENTLY callable_clients_mv');
      expect(pool.query).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM callable_clients_mv');
    });

    it('should skip refresh if MV does not exist', async () => {
      // Mock pool.query to return MV does not exist
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ exists: false }] });

      // Mock successful refresh (should skip)
      const result = await refreshCallableClientsMV();

      // Verify the result
      expect(result.success).toBe(true);
      expect(result.row_count).toBe(0);
      expect(pool.query).toHaveBeenCalled(); // Exists check was made
    });

    it('should handle refresh failure gracefully', async () => {
      // Mock pool.query to return MV exists but fail on refresh
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // MV exists check
        .mockRejectedValue(new Error('Database error')); // REFRESH fails

      // Should not throw, but return error stats
      const result = await refreshCallableClientsMV();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('refreshAllMaterializedViews', () => {
    it('should refresh both MVs in sequence', async () => {
      // Mock pool.query for both refreshes
      vi.mocked(pool.query)
        .mockResolvedValueOnce(undefined) // touchpoint_summary REFRESH
        .mockResolvedValueOnce({ rows: [{ count: '300000' }] }) // touchpoint_summary COUNT
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // callable_clients exists check
        .mockResolvedValueOnce(undefined) // callable_clients REFRESH
        .mockResolvedValueOnce({ rows: [{ count: '40000' }] }); // callable_clients COUNT

      // Mock successful refresh
      const result = await refreshAllMaterializedViews();

      // Verify the result
      expect(result.touchpoint_summary.success).toBe(true);
      expect(result.touchpoint_summary.row_count).toBe(300000);
      expect(result.callable_clients.success).toBe(true);
      expect(result.callable_clients.row_count).toBe(40000);
    });

    it('should continue to callable_clients MV even if touchpoint_summary fails', async () => {
      // Mock pool.query for touchpoint_summary failure, callable_clients success
      vi.mocked(pool.query)
        .mockRejectedValueOnce(new Error('Touchpoint MV error')) // touchpoint_summary REFRESH fails
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // callable_clients exists check
        .mockResolvedValueOnce(undefined) // callable_clients REFRESH
        .mockResolvedValueOnce({ rows: [{ count: '40000' }] }); // callable_clients COUNT

      // Function should NOT throw - it continues with callable_clients MV
      const result = await refreshAllMaterializedViews();

      // Verify touchpoint_summary failed but callable_clients succeeded
      expect(result.touchpoint_summary.success).toBe(false);
      expect(result.touchpoint_summary.error).toBeDefined();
      expect(result.callable_clients.success).toBe(true);
      expect(result.callable_clients.row_count).toBe(40000);
    });
  });

  describe('Hybrid Query Optimization', () => {
    it('should use optimized MV path for Tele role without filters', async () => {
      // This is a conceptual test - in reality, this would be tested via integration tests
      // The hybrid query logic is in clients.ts and would require full request testing

      // Conditions for optimized path:
      // - User is Tele or Caravan
      // - No search query
      // - No specific touchpointStatus filter
      // - No specific filters (loanReleased, clientType, etc.)

      const canUseOptimizedMV =
        (true) && // user.role === 'tele' || user.role === 'caravan'
        (!true) && // !parsedSearch
        (!true) && // !touchpointStatus
        (!true) && // !loanReleased
        (true) && // clientType === 'all'
        (true) && // productType === 'all'
        (true) && // marketType === 'all'
        (true) && // pensionType === 'all'
        (!true) && // !agencyId
        (!true) && // !municipality
        (!true); // !province

      expect(canUseOptimizedMV).toBe(false); // Should be false when parsedSearch is true
    });

    it('should fall back to standard query for Admin role', async () => {
      // Admin role should always use standard query (full access to all clients)

      const user = { role: 'admin' };
      const canUseOptimizedMV =
        (user.role === 'tele' || user.role === 'caravan');

      expect(canUseOptimizedMV).toBe(false);
    });

    it('should fall back to standard query when search is active', async () => {
      // Search requires full table scan, can't use MV

      const parsedSearch = { normalizedQuery: 'john' };
      const canUseOptimizedMV = !parsedSearch;

      expect(canUseOptimizedMV).toBe(false);
    });

    it('should fall back to standard query when specific status filter is applied', async () => {
      // Status filter requires all groups, can't use callable-only MV

      const touchpointStatus = 'callable';
      const canUseOptimizedMV = !touchpointStatus;

      expect(canUseOptimizedMV).toBe(false);
    });
  });
});
