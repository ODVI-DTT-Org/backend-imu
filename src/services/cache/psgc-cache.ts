// src/services/cache/psgc-cache.ts

/**
 * PSGC Cache Service
 *
 * Caches PSGC (Philippine geographic codes) queries to reduce database load
 *
 * @file psgc-cache.ts
 */

import { getCacheService, CACHE_PREFIX, CACHE_TTL } from './redis-cache.js';
import { getCacheMetrics } from './cache-metrics.js';

export interface PSGCRecord {
  id: number;
  code: string;
  region: string;
  province: string;
  city_municipality: string;
  barangay: string;
}

/**
 * PSGC cache service class
 */
export class PSGCCacheService {
  private cache = getCacheService();
  private metrics = getCacheMetrics();
  private readonly prefix = CACHE_PREFIX.PSGC;
  private readonly ttl = CACHE_TTL.DAY; // PSGC data changes rarely, cache for 24 hours

  /**
   * Get PSGC record by ID
   * @param id - PSGC ID
   * @returns PSGC record or null if not found
   */
  async getById(id: number): Promise<PSGCRecord | null> {
    const key = `${this.prefix}id:${id}`;

    try {
      const cached = await this.cache.get<PSGCRecord>(key);

      if (cached) {
        this.metrics.recordHit('psgc:id');
        return cached;
      }

      this.metrics.recordMiss('psgc:id');
      return null;
    } catch (error) {
      this.metrics.recordError('psgc:id');
      console.error(`[PSGC Cache] Get by ID error for ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Get PSGC record by code
   * @param code - PSGC code
   * @returns PSGC record or null if not found
   */
  async getByCode(code: string): Promise<PSGCRecord | null> {
    const key = `${this.prefix}code:${code}`;

    try {
      const cached = await this.cache.get<PSGCRecord>(key);

      if (cached) {
        this.metrics.recordHit('psgc:code');
        return cached;
      }

      this.metrics.recordMiss('psgc:code');
      return null;
    } catch (error) {
      this.metrics.recordError('psgc:code');
      console.error(`[PSGC Cache] Get by code error for code ${code}:`, error);
      return null;
    }
  }

  /**
   * Get multiple PSGC records by IDs
   * @param ids - Array of PSGC IDs
   * @returns Map of ID to PSGC record
   */
  async getByIds(ids: number[]): Promise<Map<number, PSGCRecord>> {
    const keys = ids.map((id) => `${this.prefix}id:${id}`);
    const result = new Map<number, PSGCRecord>();

    try {
      const cached = await this.cache.mget<PSGCRecord>(keys);

      cached.forEach((value, index) => {
        if (value) {
          result.set(ids[index], value);
          this.metrics.recordHit('psgc:id');
        } else {
          this.metrics.recordMiss('psgc:id');
        }
      });

      return result;
    } catch (error) {
      this.metrics.recordError('psgc:id');
      console.error('[PSGC Cache] Get by IDs error:', error);
      return result;
    }
  }

  /**
   * Set PSGC record in cache
   * @param psgc - PSGC record to cache
   * @returns True if successful
   */
  async set(psgc: PSGCRecord): Promise<boolean> {
    const idKey = `${this.prefix}id:${psgc.id}`;
    const codeKey = `${this.prefix}code:${psgc.code}`;

    try {
      // Cache by both ID and code for flexible lookups
      await Promise.all([
        this.cache.set(idKey, psgc, this.ttl),
        this.cache.set(codeKey, psgc, this.ttl),
      ]);

      this.metrics.recordSet('psgc');
      return true;
    } catch (error) {
      this.metrics.recordError('psgc');
      console.error('[PSGC Cache] Set error:', error);
      return false;
    }
  }

  /**
   * Set multiple PSGC records in cache
   * @param psgcList - Array of PSGC records to cache
   * @returns True if successful
   */
  async setMany(psgcList: PSGCRecord[]): Promise<boolean> {
    if (psgcList.length === 0) {
      return false;
    }

    try {
      const items: Array<{ key: string; value: PSGCRecord }> = [];

      psgcList.forEach((psgc) => {
        items.push({ key: `${this.prefix}id:${psgc.id}`, value: psgc });
        items.push({ key: `${this.prefix}code:${psgc.code}`, value: psgc });
      });

      await this.cache.mset(items, this.ttl);

      this.metrics.recordSet('psgc');
      return true;
    } catch (error) {
      this.metrics.recordError('psgc');
      console.error('[PSGC Cache] Set many error:', error);
      return false;
    }
  }

  /**
   * Invalidate PSGC cache by ID
   * @param id - PSGC ID to invalidate
   * @returns True if successful
   */
  async invalidateById(id: number): Promise<boolean> {
    const key = `${this.prefix}id:${id}`;

    try {
      await this.cache.del(key);
      this.metrics.recordDelete('psgc');
      return true;
    } catch (error) {
      this.metrics.recordError('psgc');
      console.error(`[PSGC Cache] Invalidate by ID error for ID ${id}:`, error);
      return false;
    }
  }

  /**
   * Invalidate all PSGC cache
   * @returns True if successful
   */
  async invalidateAll(): Promise<boolean> {
    try {
      await this.cache.delPattern(`${this.prefix}*`);
      this.metrics.recordDelete('psgc');
      return true;
    } catch (error) {
      this.metrics.recordError('psgc');
      console.error('[PSGC Cache] Invalidate all error:', error);
      return false;
    }
  }

  /**
   * Get PSGC cache statistics
   * @returns Cache stats for PSGC queries
   */
  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const stats = this.metrics.getStats('psgc:id');

    return {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
    };
  }
}

// Singleton instance
let psgcCacheInstance: PSGCCacheService | null = null;

/**
 * Get the singleton PSGC cache service instance
 * @returns PSGC cache service
 */
export function getPSGCCache(): PSGCCacheService {
  if (!psgcCacheInstance) {
    psgcCacheInstance = new PSGCCacheService();
  }
  return psgcCacheInstance;
}

/**
 * Reset the singleton PSGC cache service instance (useful for testing)
 */
export function resetPSGCCache(): void {
  psgcCacheInstance = null;
}
