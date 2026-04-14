// src/services/cache/redis-cache.ts

/**
 * Redis Cache Service
 *
 * Provides a Redis-backed caching layer for frequently accessed data
 *
 * @file redis-cache.ts
 */

import Redis from 'ioredis';

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  SHORT: 300,      // 5 minutes
  MEDIUM: 1800,    // 30 minutes
  LONG: 3600,      // 1 hour
  DAY: 86400,      // 24 hours
} as const;

// Cache key prefixes
export const CACHE_PREFIX = {
  ADDRESSES: 'addr:',
  PHONE_NUMBERS: 'phone:',
  PSGC: 'psgc:',
  CLIENT: 'client:',
} as const;

/**
 * Redis cache service class
 */
export class RedisCacheService {
  private client: Redis;
  private enabled: boolean;
  private defaultTTL: number;

  /**
   * Create a new Redis cache service
   * @param redisUrl - Redis connection URL (optional, uses REDIS_URL env var)
   * @param defaultTTL - Default TTL in seconds (default: 300)
   */
  constructor(redisUrl?: string, defaultTTL: number = CACHE_TTL.MEDIUM) {
    this.enabled = !!process.env.REDIS_URL || !!redisUrl;
    this.defaultTTL = defaultTTL;

    if (this.enabled) {
      const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379/0';
      this.client = new Redis(url, {
        // Connection pool settings
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        // Enable ready check for better connection reliability
        enableReadyCheck: true,
        // Disable offline queue to fail fast when Redis is down
        // This prevents memory buildup when Redis is unavailable
        enableOfflineQueue: false,
        // Keep connection alive with periodic pings
        keepAlive: 30000,
        // Connection name for debugging in Redis
        connectionName: 'imu-backend-cache',
        // Limit pipeline size to prevent memory overload
        maxLoadingChunkSize: 100,
        // Show friendly error stack traces
        showFriendlyErrorStack: true,
      });

      this.client.on('error', (err) => {
        console.error(`[Redis Cache] Error: ${err.message}`);
      });

      this.client.on('connect', () => {
        console.log('[Redis Cache] Connected');
      });
    } else {
      // Mock client for when Redis is disabled
      this.client = new Redis('redis://localhost:6379/0', { lazyConnect: true });
      console.log('[Redis Cache] Disabled (no REDIS_URL configured)');
    }
  }

  /**
   * Get a value from cache
   * @param key - Cache key
   * @returns Cached value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[Redis Cache] Get error for key "${key}":`, error);
      return null;
    }
  }

  /**
   * Set a value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds (optional, uses default)
   * @returns True if successful
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl ?? this.defaultTTL;

      await this.client.set(key, serialized, 'EX', expiry);
      return true;
    } catch (error) {
      console.error(`[Redis Cache] Set error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Delete a value from cache
   * @param key - Cache key to delete
   * @returns True if successful
   */
  async del(key: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`[Redis Cache] Delete error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   * @param pattern - Key pattern (e.g., "addr:*")
   * @returns Number of keys deleted
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      return await this.client.del(...keys);
    } catch (error) {
      console.error(`[Redis Cache] Delete pattern error for "${pattern}":`, error);
      return 0;
    }
  }

  /**
   * Check if a key exists
   * @param key - Cache key
   * @returns True if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`[Redis Cache] Exists error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Increment a counter
   * @param key - Counter key
   * @returns New counter value
   */
  async incr(key: string): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error(`[Redis Cache] Increment error for key "${key}":`, error);
      return 0;
    }
  }

  /**
   * Get multiple values
   * @param keys - Array of cache keys
   * @returns Array of values (null for missing keys)
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!this.enabled || keys.length === 0) {
      return keys.map(() => null);
    }

    try {
      const values = await this.client.mget(...keys);
      return values.map((v) => (v ? JSON.parse(v) : null));
    } catch (error) {
      console.error('[Redis Cache] MGET error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values
   * @param items - Array of key-value pairs
   * @param ttl - Time to live in seconds (optional, uses default)
   * @returns True if all successful
   */
  async mset<T>(items: Array<{ key: string; value: T }>, ttl?: number): Promise<boolean> {
    if (!this.enabled || items.length === 0) {
      return false;
    }

    try {
      const pipeline = this.client.pipeline();
      const expiry = ttl ?? this.defaultTTL;

      items.forEach(({ key, value }) => {
        pipeline.set(key, JSON.stringify(value), 'EX', expiry);
      });

      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('[Redis Cache] MSET error:', error);
      return false;
    }
  }

  /**
   * Flush all cache (use with caution!)
   * @returns True if successful
   */
  async flush(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      await this.client.flushdb();
      return true;
    } catch (error) {
      console.error('[Redis Cache] Flush error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns Cache stats
   */
  async getStats(): Promise<{
    keyCount: number;
    memoryUsage: string;
    hitRate: number;
  }> {
    if (!this.enabled) {
      return {
        keyCount: 0,
        memoryUsage: '0B',
        hitRate: 0,
      };
    }

    try {
      const info = await this.client.info('stats');
      const keyCount = await this.client.dbsize();
      const memoryInfo = await this.client.info('memory');

      // Parse memory usage
      const memoryMatch = memoryInfo.match(/used_memory_human:(.+)/i);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : '0B';

      return {
        keyCount,
        memoryUsage,
        hitRate: 0, // Would need to track hits/misses
      };
    } catch (error) {
      console.error('[Redis Cache] Get stats error:', error);
      return {
        keyCount: 0,
        memoryUsage: '0B',
        hitRate: 0,
      };
    }
  }

  /**
   * Close the Redis connection
   */
  async quit(): Promise<void> {
    if (this.enabled) {
      await this.client.quit();
    }
  }

  /**
   * Get the underlying Redis client
   * @returns Redis client instance
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Check if cache is enabled
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
let cacheInstance: RedisCacheService | null = null;

/**
 * Get the singleton Redis cache service instance
 * @returns Redis cache service
 */
export function getCacheService(): RedisCacheService {
  if (!cacheInstance) {
    cacheInstance = new RedisCacheService();
  }
  return cacheInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetCacheService(): void {
  if (cacheInstance) {
    cacheInstance.quit().catch(console.error);
    cacheInstance = null;
  }
}
