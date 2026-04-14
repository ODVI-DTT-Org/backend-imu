// src/services/cache/clients-cache.ts

/**
 * Clients Cache Service
 *
 * Caches assigned client IDs and touchpoint summaries for Tele/Caravan users
 * Implements cache stampede prevention with distributed locks
 *
 * Part of Redis caching implementation
 *
 * @file clients-cache.ts
 */

import { getCacheService, RedisCacheService } from './redis-cache.js';

// Cache key prefixes with version (v1) for future migrations
const CACHE_PREFIX = 'v1:clients:';

// Cache TTL constants (in seconds)
const CACHE_TTL = {
  ASSIGNED_IDS: 43200,      // 12 hours - assigned client IDs change infrequently
  TOUCHPOINT_SUMMARY: 300,  // 5 minutes - touchpoint data changes frequently
  ASSIGNED_AREAS: 3600,     // 1 hour - area assignments change rarely
  LOCK: 10,                 // 10 seconds - cache stampede prevention lock
} as const;

/**
 * Touchpoint summary for a single client
 */
export interface TouchpointSummary {
  client_id: string;
  total_count: number;
  completed_count: number;
  next_touchpoint_type: 'Visit' | 'Call' | null;
  next_touchpoint_number: number | null;
  last_touchpoint_type: 'Visit' | 'Call' | null;
  last_touchpoint_date: Date | null;
}

/**
 * Assigned clients response
 */
export interface AssignedClientsData {
  client_ids: string[];
  areas: string[];
  last_updated: string;
}

/**
 * Clients Cache Service
 *
 * Caches assigned client IDs and touchpoint summaries with:
 * - Versioned keys (v1) for future migrations
 * - Appropriate TTLs per data type
 * - Cache stampede prevention with locks
 */
export class ClientsCacheService {
  private cache: RedisCacheService;
  private lockTimeout: number;

  constructor(cacheService?: RedisCacheService) {
    this.cache = cacheService || getCacheService();
    this.lockTimeout = CACHE_TTL.LOCK;
  }

  /**
   * Get assigned client IDs for a user from cache
   * @param userId - User ID
   * @returns Assigned client IDs or null if not cached
   */
  async getAssignedClientIds(userId: string): Promise<string[] | null> {
    const key = `${CACHE_PREFIX}user:assigned_ids:${userId}`;
    try {
      const data = await this.cache.get<AssignedClientsData>(key);
      return data?.client_ids || null;
    } catch (error) {
      console.error(`[ClientsCache] Get assigned IDs error for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Set assigned client IDs for a user in cache
   * @param userId - User ID
   * @param clientIds - Array of client IDs
   * @param areas - Assigned areas (provinces/municipalities)
   */
  async setAssignedClientIds(
    userId: string,
    clientIds: string[],
    areas: string[] = []
  ): Promise<void> {
    const key = `${CACHE_PREFIX}user:assigned_ids:${userId}`;
    const data: AssignedClientsData = {
      client_ids: clientIds,
      areas,
      last_updated: new Date().toISOString(),
    };

    try {
      await this.cache.set(key, data, CACHE_TTL.ASSIGNED_IDS);
      console.debug(`[ClientsCache] Cached ${clientIds.length} assigned IDs for user ${userId}`);
    } catch (error) {
      console.error(`[ClientsCache] Set assigned IDs error for user ${userId}:`, error);
    }
  }

  /**
   * Get assigned areas for a user from cache
   * @param userId - User ID
   * @returns Assigned areas or null if not cached
   */
  async getAssignedAreas(userId: string): Promise<string[] | null> {
    const key = `${CACHE_PREFIX}user:assigned_areas:${userId}`;
    try {
      const data = await this.cache.get<string[]>(key);
      return data;
    } catch (error) {
      console.error(`[ClientsCache] Get assigned areas error for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Set assigned areas for a user in cache
   * @param userId - User ID
   * @param areas - Array of areas (provinces/municipalities)
   */
  async setAssignedAreas(userId: string, areas: string[]): Promise<void> {
    const key = `${CACHE_PREFIX}user:assigned_areas:${userId}`;
    try {
      await this.cache.set(key, areas, CACHE_TTL.ASSIGNED_AREAS);
      console.debug(`[ClientsCache] Cached ${areas.length} areas for user ${userId}`);
    } catch (error) {
      console.error(`[ClientsCache] Set assigned areas error for user ${userId}:`, error);
    }
  }

  /**
   * Get touchpoint summary for a single client from cache
   * @param clientId - Client ID
   * @returns Touchpoint summary or null if not cached
   */
  async getTouchpointSummary(clientId: string): Promise<TouchpointSummary | null> {
    const key = `${CACHE_PREFIX}client:touchpoint_summary:${clientId}`;
    try {
      return await this.cache.get<TouchpointSummary>(key);
    } catch (error) {
      console.error(`[ClientsCache] Get touchpoint summary error for client ${clientId}:`, error);
      return null;
    }
  }

  /**
   * Set touchpoint summary for a single client in cache
   * @param clientId - Client ID
   * @param summary - Touchpoint summary data
   */
  async setTouchpointSummary(clientId: string, summary: TouchpointSummary): Promise<void> {
    const key = `${CACHE_PREFIX}client:touchpoint_summary:${clientId}`;
    try {
      await this.cache.set(key, summary, CACHE_TTL.TOUCHPOINT_SUMMARY);
    } catch (error) {
      console.error(`[ClientsCache] Set touchpoint summary error for client ${clientId}:`, error);
    }
  }

  /**
   * Get touchpoint summaries for multiple clients from cache
   * Uses MGET for efficient batch retrieval
   * @param clientIds - Array of client IDs
   * @returns Map of client ID to touchpoint summary
   */
  async getTouchpointSummaries(clientIds: string[]): Promise<Map<string, TouchpointSummary>> {
    if (clientIds.length === 0) {
      return new Map();
    }

    const keys = clientIds.map((id) => `${CACHE_PREFIX}client:touchpoint_summary:${id}`);
    const result = new Map<string, TouchpointSummary>();

    try {
      const values = await this.cache.mget<TouchpointSummary>(keys);

      for (let i = 0; i < clientIds.length; i++) {
        const summary = values[i];
        if (summary) {
          result.set(clientIds[i], summary);
        }
      }

      console.debug(`[ClientsCache] Cache hit: ${result.size}/${clientIds.length} summaries`);
      return result;
    } catch (error) {
      console.error('[ClientsCache] Get touchpoint summaries error:', error);
      return new Map();
    }
  }

  /**
   * Set touchpoint summaries for multiple clients in cache
   * Uses pipeline for efficient batch writes
   * @param summaries - Map of client ID to touchpoint summary
   */
  async setTouchpointSummaries(summaries: Map<string, TouchpointSummary>): Promise<void> {
    if (summaries.size === 0) {
      return;
    }

    const items = Array.from(summaries.entries()).map(([clientId, summary]) => ({
      key: `${CACHE_PREFIX}client:touchpoint_summary:${clientId}`,
      value: summary,
    }));

    try {
      await this.cache['mset'](items, CACHE_TTL.TOUCHPOINT_SUMMARY);
      console.debug(`[ClientsCache] Cached ${items.length} touchpoint summaries`);
    } catch (error) {
      console.error('[ClientsCache] Set touchpoint summaries error:', error);
    }
  }

  /**
   * Invalidate all cache entries for a user
   * Called when client assignments change
   * @param userId - User ID
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const patterns = [
      `${CACHE_PREFIX}user:assigned_ids:${userId}`,
      `${CACHE_PREFIX}user:assigned_areas:${userId}`,
    ];

    try {
      for (const key of patterns) {
        await this.cache.del(key);
      }
      console.debug(`[ClientsCache] Invalidated cache for user ${userId}`);
    } catch (error) {
      console.error(`[ClientsCache] Invalidate user cache error for ${userId}:`, error);
    }
  }

  /**
   * Invalidate touchpoint summary cache for a client
   * Called when touchpoint data changes
   * @param clientId - Client ID
   */
  async invalidateTouchpointSummary(clientId: string): Promise<void> {
    const key = `${CACHE_PREFIX}client:touchpoint_summary:${clientId}`;
    try {
      await this.cache.del(key);
      console.debug(`[ClientsCache] Invalidated touchpoint summary for client ${clientId}`);
    } catch (error) {
      console.error(`[ClientsCache] Invalidate touchpoint summary error for ${clientId}:`, error);
    }
  }

  /**
   * Invalidate touchpoint summary cache for multiple clients
   * Uses pipeline for efficient batch deletion
   * @param clientIds - Array of client IDs
   */
  async invalidateTouchpointSummaries(clientIds: string[]): Promise<void> {
    if (clientIds.length === 0) {
      return;
    }

    const keys = clientIds.map((id) => `${CACHE_PREFIX}client:touchpoint_summary:${id}`);

    try {
      const client = this.cache.getClient();
      await client.del(...keys);
      console.debug(`[ClientsCache] Invalidated ${clientIds.length} touchpoint summaries`);
    } catch (error) {
      console.error('[ClientsCache] Invalidate touchpoint summaries error:', error);
    }
  }

  /**
   * Acquire a distributed lock to prevent cache stampede
   * @param cacheKey - The cache key being protected
   * @returns True if lock acquired, false otherwise
   */
  async acquireLock(cacheKey: string): Promise<boolean> {
    const lockKey = `${CACHE_PREFIX}lock:${cacheKey}`;

    try {
      const client = this.cache.getClient();
      // Use SET with NX (only set if not exists) and EX (expiration)
      const result = await client.set(lockKey, '1', 'EX', this.lockTimeout, 'NX');
      return result === 'OK';
    } catch (error) {
      console.error(`[ClientsCache] Acquire lock error for ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Release a distributed lock
   * @param cacheKey - The cache key being protected
   */
  async releaseLock(cacheKey: string): Promise<void> {
    const lockKey = `${CACHE_PREFIX}lock:${cacheKey}`;

    try {
      await this.cache.del(lockKey);
    } catch (error) {
      console.error(`[ClientsCache] Release lock error for ${cacheKey}:`, error);
    }
  }

  /**
   * Execute a function with cache stampede protection
   * Uses lock to ensure only one request populates the cache
   * @param cacheKey - The cache key being protected
   * @param fn - Function to execute if cache miss
   * @returns Result from cache or function execution
   */
  async withLock<T>(cacheKey: string, fn: () => Promise<T>): Promise<T> {
    const lockAcquired = await this.acquireLock(cacheKey);

    if (!lockAcquired) {
      // Lock not acquired, wait briefly and try to get from cache again
      await this.sleep(100);
      // Return null to indicate caller should retry
      throw new Error('Cache lock not acquired - retry recommended');
    }

    try {
      // Execute the function to populate cache
      return await fn();
    } finally {
      // Always release the lock
      await this.releaseLock(cacheKey);
    }
  }

  /**
   * Sleep helper for lock retry
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear all clients cache (use with caution!)
   * @returns Number of keys deleted
   */
  async clearAll(): Promise<number> {
    try {
      return await this.cache.delPattern(`${CACHE_PREFIX}*`);
    } catch (error) {
      console.error('[ClientsCache] Clear all error:', error);
      return 0;
    }
  }
}

// Singleton instance
let clientsCacheInstance: ClientsCacheService | null = null;

/**
 * Get the singleton clients cache service instance
 * @returns Clients cache service
 */
export function getClientsCacheService(): ClientsCacheService {
  if (!clientsCacheInstance) {
    clientsCacheInstance = new ClientsCacheService();
  }
  return clientsCacheInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetClientsCacheService(): void {
  clientsCacheInstance = null;
}
