import Redis from 'ioredis';

/**
 * Redis cache service for caching presigned S3 URLs
 * Reduces S3 API calls and improves performance
 */
class CacheService {
  private redis: Redis | null = null;
  private isConnected: boolean = false;

  constructor() {
    if (process.env.REDIS_URL) {
      try {
        this.redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 3,
          retryStrategy(times: number) {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
        });

        this.redis.on('connect', () => {
          console.log('[CacheService] ✅ Redis connected');
          this.isConnected = true;
        });

        this.redis.on('error', (err) => {
          console.error('[CacheService] ❌ Redis error:', err);
          this.isConnected = false;
        });

        this.redis.on('close', () => {
          console.log('[CacheService] 🔌 Redis connection closed');
          this.isConnected = false;
        });

        // Test connection
        this.redis.ping().then(() => {
          console.log('[CacheService] ✅ Redis ping successful');
        }).catch((err) => {
          console.error('[CacheService] ❌ Redis ping failed:', err);
        });

      } catch (error) {
        console.error('[CacheService] ❌ Failed to initialize Redis:', error);
        this.redis = null;
        this.isConnected = false;
      }
    } else {
      console.log('[CacheService] ⚠️  Redis not configured, caching disabled');
    }
  }

  /**
   * Get a value from cache
   */
  async get(key: string): Promise<string | null> {
    if (!this.redis || !this.isConnected) {
      return null;
    }

    try {
      const value = await this.redis.get(key);
      return value;
    } catch (error) {
      console.error('[CacheService] GET error:', error);
      return null;
    }
  }

  /**
   * Set a value in cache with TTL
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.redis || !this.isConnected) {
      return;
    }

    try {
      await this.redis.setex(key, ttlSeconds, value);
    } catch (error) {
      console.error('[CacheService] SET error:', error);
    }
  }

  /**
   * Delete a value from cache
   */
  async del(key: string): Promise<void> {
    if (!this.redis || !this.isConnected) {
      return;
    }

    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('[CacheService] DEL error:', error);
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (!this.redis || !this.isConnected) {
      return keys.map(() => null);
    }

    try {
      const values = await this.redis.mget(keys);
      return values;
    } catch (error) {
      console.error('[CacheService] MGET error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Check if Redis is connected and ready
   */
  isReady(): boolean {
    return this.redis !== null && this.isConnected;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
      console.log('[CacheService] Redis connection closed');
    }
  }
}

export const cacheService = new CacheService();
