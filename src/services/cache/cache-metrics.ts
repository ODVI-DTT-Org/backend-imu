// src/services/cache/cache-metrics.ts

/**
 * Cache Metrics Tracking
 *
 * Tracks cache performance metrics for monitoring and optimization
 *
 * @file cache-metrics.ts
 */

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number; // hits / (hits + misses)
  missRate: number; // misses / (hits + misses)
  totalRequests: number; // hits + misses
}

/**
 * Cache metrics tracker class
 */
export class CacheMetricsTracker {
  private metrics: Map<string, CacheMetrics>;

  constructor() {
    this.metrics = new Map();
  }

  /**
   * Record a cache hit
   * @param key - Cache key (optional, tracks global if not provided)
   */
  recordHit(key?: string): void {
    const metricsKey = key || '__global__';
    const current = this.metrics.get(metricsKey) || this.getEmptyMetrics();
    this.metrics.set(metricsKey, {
      ...current,
      hits: current.hits + 1,
    });
  }

  /**
   * Record a cache miss
   * @param key - Cache key (optional, tracks global if not provided)
   */
  recordMiss(key?: string): void {
    const metricsKey = key || '__global__';
    const current = this.metrics.get(metricsKey) || this.getEmptyMetrics();
    this.metrics.set(metricsKey, {
      ...current,
      misses: current.misses + 1,
    });
  }

  /**
   * Record a cache set
   * @param key - Cache key (optional, tracks global if not provided)
   */
  recordSet(key?: string): void {
    const metricsKey = key || '__global__';
    const current = this.metrics.get(metricsKey) || this.getEmptyMetrics();
    this.metrics.set(metricsKey, {
      ...current,
      sets: current.sets + 1,
    });
  }

  /**
   * Record a cache delete
   * @param key - Cache key (optional, tracks global if not provided)
   */
  recordDelete(key?: string): void {
    const metricsKey = key || '__global__';
    const current = this.metrics.get(metricsKey) || this.getEmptyMetrics();
    this.metrics.set(metricsKey, {
      ...current,
      deletes: current.deletes + 1,
    });
  }

  /**
   * Record a cache error
   * @param key - Cache key (optional, tracks global if not provided)
   */
  recordError(key?: string): void {
    const metricsKey = key || '__global__';
    const current = this.metrics.get(metricsKey) || this.getEmptyMetrics();
    this.metrics.set(metricsKey, {
      ...current,
      errors: current.errors + 1,
    });
  }

  /**
   * Get metrics for a specific key or global metrics
   * @param key - Cache key (optional, returns global if not provided)
   * @returns Cache stats
   */
  getStats(key?: string): CacheStats {
    const metricsKey = key || '__global__';
    const metrics = this.metrics.get(metricsKey) || this.getEmptyMetrics();
    const totalRequests = metrics.hits + metrics.misses;

    return {
      ...metrics,
      hitRate: totalRequests > 0 ? metrics.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? metrics.misses / totalRequests : 0,
      totalRequests,
    };
  }

  /**
   * Get all tracked metrics
   * @returns Map of all metrics
   */
  getAllMetrics(): Map<string, CacheStats> {
    const allStats = new Map<string, CacheStats>();

    this.metrics.forEach((metrics, key) => {
      const totalRequests = metrics.hits + metrics.misses;
      allStats.set(key, {
        ...metrics,
        hitRate: totalRequests > 0 ? metrics.hits / totalRequests : 0,
        missRate: totalRequests > 0 ? metrics.misses / totalRequests : 0,
        totalRequests,
      });
    });

    return allStats;
  }

  /**
   * Reset metrics for a specific key or all metrics
   * @param key - Cache key (optional, resets all if not provided)
   */
  reset(key?: string): void {
    if (key) {
      this.metrics.set(key, this.getEmptyMetrics());
    } else {
      this.metrics.clear();
    }
  }

  /**
   * Get empty metrics object
   * @returns Empty cache metrics
   */
  private getEmptyMetrics(): CacheMetrics {
    return {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
  }

  /**
   * Get a summary of all metrics (aggregated)
   * @returns Aggregated cache stats
   */
  getSummary(): CacheStats {
    let summary = this.getEmptyMetrics();

    this.metrics.forEach((metrics) => {
      summary.hits += metrics.hits;
      summary.misses += metrics.misses;
      summary.sets += metrics.sets;
      summary.deletes += metrics.deletes;
      summary.errors += metrics.errors;
    });

    const totalRequests = summary.hits + summary.misses;

    return {
      ...summary,
      hitRate: totalRequests > 0 ? summary.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? summary.misses / totalRequests : 0,
      totalRequests,
    };
  }
}

// Singleton instance
let metricsInstance: CacheMetricsTracker | null = null;

/**
 * Get the singleton cache metrics tracker instance
 * @returns Cache metrics tracker
 */
export function getCacheMetrics(): CacheMetricsTracker {
  if (!metricsInstance) {
    metricsInstance = new CacheMetricsTracker();
  }
  return metricsInstance;
}

/**
 * Reset the singleton metrics tracker instance (useful for testing)
 */
export function resetCacheMetrics(): void {
  metricsInstance = null;
}
