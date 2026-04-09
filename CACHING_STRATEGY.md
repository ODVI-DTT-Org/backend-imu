# Caching Strategy for Addresses & Phone Numbers

This document outlines the caching strategy for improving performance of addresses and phone numbers endpoints.

---

## Overview

**Current State:**
- All requests hit the database
- No caching of frequently accessed data
- PSGC lookups on every address request

**Target State:**
- Multi-layer caching (Redis + HTTP)
- Automatic cache invalidation
- Reduced database load
- Improved response times

---

## Caching Layers

### Layer 1: Redis Cache (Backend)

**Cache Keys:**
```
addresses:client:{client_id}        # List of addresses
addresses:address:{address_id}      # Single address
phone_numbers:client:{client_id}    # List of phone numbers
phone_numbers:phone:{phone_id}      # Single phone number
psgc:{psgc_id}                      # PSGC data
psgc:regions                         # All regions
psgc:provinces:{region}              # Provinces by region
```

**TTL (Time To Live):**
- Addresses: 5 minutes
- Phone numbers: 5 minutes
- PSGC data: 1 hour (rarely changes)

**Implementation:**
```typescript
// src/cache/redis_cache.ts

import { Redis } from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

export class CacheService {
  /**
   * Get cached data
   */
  async get<T>(key: string): Promise<T | null> {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Set cached data with TTL
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    await redis.setex(key, ttl, JSON.stringify(value));
  }

  /**
   * Invalidate cache pattern
   */
  async invalidate(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Cache wrapper for database queries
   */
  async cached<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached) return cached;

    const result = await fn();
    await this.set(key, result, ttl);
    return result;
  }
}

const cache = new CacheService();
```

---

### Layer 2: HTTP Caching (Client Side)

**Cache Headers:**
```typescript
// addresses.ts

// Add cache headers to GET responses
addresses.get('/clients/:id/addresses', authMiddleware, async (c) => {
  // ... existing code

  return c.json(
    { success: true, data: result.rows.map(mapRowToAddress) },
    200, {
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 minutes
        'ETag': generateETag(result.rows),
      }
    }
  );
});
```

---

## Cache Invalidation Strategy

### Automatic Invalidation

**When to Invalidate:**

1. **Create Operation:**
```typescript
// Invalidate client's address list when creating new address
await cache.invalidate(`addresses:client:${clientId}`);
```

2. **Update Operation:**
```typescript
// Invalidate both list and single address cache
await cache.invalidate(`addresses:client:${clientId}`);
await cache.invalidate(`addresses:address:${addressId}`);
```

3. **Delete Operation:**
```typescript
// Invalidate both list and single address cache
await cache.invalidate(`addresses:client:${clientId}`);
await cache.invalidate(`addresses:address:${addressId}`);
```

4. **Set Primary Operation:**
```typescript
// Invalidate entire client's addresses (order changes)
await cache.invalidate(`addresses:client:${clientId}`);
```

### Cache Tags (Advanced)

**Use cache tags for smarter invalidation:**
```typescript
// Set cache with tags
await cache.set('addresses:client:123', data, 300, {
  tags: ['client:123', 'addresses']
});

// Invalidate by tag
await cache.invalidateByTag('client:123');
```

---

## Implementation Examples

### Example 1: Cache Address List

**Before:**
```typescript
addresses.get('/clients/:id/addresses', authMiddleware, async (c) => {
  const result = await pool.query(
    'SELECT a.*, p.* FROM addresses a LEFT JOIN psgc p ON a.psgc_id = p.id WHERE a.client_id = $1',
    [clientId]
  );
  return c.json({ success: true, data: result.rows.map(mapRowToAddress) });
});
```

**After:**
```typescript
addresses.get('/clients/:id/addresses', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const cacheKey = `addresses:client:${clientId}`;

  // Try cache first
  const cached = await cache.get(cacheKey);
  if (cached) {
    return c.json({ success: true, data: cached, _cached: true });
  }

  // Cache miss - query database
  const result = await pool.query(
    'SELECT a.*, p.* FROM addresses a LEFT JOIN psgc p ON a.psgc_id = p.id WHERE a.client_id = $1',
    [clientId]
  );

  const data = result.rows.map(mapRowToAddress);

  // Store in cache
  await cache.set(cacheKey, data, 300); // 5 minutes

  return c.json({ success: true, data: data, _cached: false });
});
```

---

### Example 2: Cache PSGC Data

**PSGC Repository with Caching:**
```typescript
// src/repositories/psgc_repository.ts

export class PSGCRepository {
  async getRegions(): Promise<PsgcRegion[]> {
    return await cache.cached(
      'psgc:regions',
      async () => {
        const result = await pool.query(
          'SELECT DISTINCT region as name, region as code FROM psgc ORDER BY region'
        );
        return result.rows;
      },
      3600 // 1 hour TTL
    );
  }

  async getProvincesByRegion(region: string): Promise<PsgcProvince[]> {
    return await cache.cached(
      `psgc:provinces:${region}`,
      async () => {
        const result = await pool.query(
          'SELECT DISTINCT province as name, province as code FROM psgc WHERE region = $1 ORDER BY province',
          [region]
        );
        return result.rows;
      },
      3600 // 1 hour TTL
    );
  }
}
```

---

### Example 3: Invalidation on Create

**Create Address with Cache Invalidation:**
```typescript
addresses.post('/clients/:id/addresses', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const body = await c.req.json();

  // ... validation ...

  // Create address
  const result = await pool.query(
    'INSERT INTO addresses (...) VALUES (...) RETURNING *',
    [clientId, data.psgc_id, data.label, data.street_address, ...]
  );

  // Invalidate cache
  await cache.invalidate(`addresses:client:${clientId}`);

  return c.json({
    success: true,
    data: mapRowToAddress(result.rows[0]),
  }, 201);
});
```

---

## Mobile Caching (PowerSync)

PowerSync already provides local caching:
- Data synced to local SQLite database
- No network calls for synced data
- Automatic background sync

**Additional Mobile Caching:**
```dart
// lib/services/cache/memory_cache.dart

class MemoryCache {
  final _cache = <String, dynamic>{};
  final _ttl = <String, DateTime>{};

  T? get<T>(String key) {
    if (_ttl.containsKey(key) && _ttl[key]!.isBefore(DateTime.now())) {
      _cache.remove(key);
      _ttl.remove(key);
      return null;
    }
    return _cache[key] as T?;
  }

  void set(String key, dynamic value, Duration ttl) {
    _cache[key] = value;
    _ttl[key] = DateTime.now().add(ttl);
  }

  void invalidate(String key) {
    _cache.remove(key);
    _ttl.remove(key);
  }

  void invalidatePattern(String pattern) {
    final regex = RegExp(pattern);
    final keysToRemove = _cache.keys.where(regex.hasMatch).toList();
    for (final key in keysToRemove) {
      invalidate(key);
    }
  }
}
```

---

## Cache Warming

**Pre-populate cache on startup:**
```typescript
// src/cache/cache_warmer.ts

export async function warmCache() {
  console.log('Warming cache...');

  // Warm PSGC data (rarely changes)
  const psgcRepo = new PSGCRepository();
  await psgcRepo.getRegions();
  await psgcRepo.getAllProvinces();

  console.log('Cache warmed');
}

// Call on server startup
warmCache();
```

---

## Monitoring & Metrics

**Track Cache Performance:**
```typescript
// src/cache/cache_metrics.ts

export class CacheMetrics {
  static hits = 0;
  static misses = 0;
  static invalidations = 0;

  static get hitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }

  static log() {
    console.log('Cache Metrics:', {
      hits: this.hits,
      misses: this.misses,
      hitRate: `${(this.hitRate() * 100).toFixed(2)}%`,
      invalidations: this.invalidations,
    });
  }
}

// Use in cache service
if (cached) {
  CacheMetrics.hits++;
} else {
  CacheMetrics.misses++;
}
```

---

## Implementation Checklist

### Backend (Node.js/PostgreSQL):
- [x] Install Redis (ioredis v5.10.1 already installed)
- [x] Create cache service (`src/services/cache/redis-cache.ts`)
- [x] Add Redis to environment variables (REDIS_URL in .env.example)
- [x] Implement cache middleware (integrated into routes)
- [x] Add caching to GET endpoints (addresses and phone-numbers)
- [x] Implement cache invalidation on POST/PUT/DELETE
- [x] Add cache metrics (`src/services/cache/cache-metrics.ts`)
- [x] Test cache hit/miss behavior (integration tests added)
- [x] Add cache statistics endpoint (/api/cache/stats)

### Mobile (Flutter):
- [ ] Implement in-memory cache for API responses
- [ ] Add cache invalidation on mutations
- [ ] Monitor cache effectiveness
- [ ] Test offline behavior (PowerSync handles most)

---

## Performance Targets

**Before Caching:**
- Average response time: 200-500ms
- Database queries per request: 2-5
- Database CPU usage: High

**After Caching:**
- Average response time: 10-50ms (cached)
- Database queries per request: 0-1
- Database CPU usage: Low
- Cache hit rate target: >80%

---

## Troubleshooting

### Issue: Stale Cache

**Problem:** Client sees old data after update.

**Solution:**
- Verify cache invalidation on mutations
- Check TTL is appropriate
- Consider shorter TTL for frequently updated data

### Issue: Low Cache Hit Rate

**Problem:** Most requests miss cache.

**Solution:**
- Increase TTL
- Pre-warm cache on startup
- Check cache key consistency
- Monitor cache patterns

### Issue: Memory Overhead

**Problem:** Redis using too much memory.

**Solution:**
- Reduce TTL
- Use LRU eviction policy
- Monitor cache size
- Implement cache size limits

---

## Alternative: No Redis

**If Redis is not available, use in-memory cache:**

```typescript
// Simple in-memory cache (single server only)
const memoryCache = new Map<string, { data: any, expires: number }>();

function get(key: string) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

function set(key: string, data: any, ttl: number) {
  memoryCache.set(key, {
    data,
    expires: Date.now() + ttl * 1000,
  });
}
```

**Limitations:**
- Doesn't work with multiple server instances
- Lost on server restart
- Uses server memory

---

## Next Steps

1. **Setup Redis:**
   - Install Redis locally for development
   - Configure Redis for production (AWS ElastiCache, etc.)

2. **Implement Cache Service:**
   - Create cache service files
   - Add to existing endpoints

3. **Test Thoroughly:**
   - Verify cache invalidation works
   - Check cache hit rates
   - Monitor performance improvements

4. **Monitor & Iterate:**
   - Track cache metrics
   - Adjust TTL as needed
   - Optimize cache keys

---

## Implementation Status

**Status:** ✅ **COMPLETED** (2026-04-08)

**What Was Implemented:**
1. **Redis Cache Service** (`src/services/cache/redis-cache.ts`)
   - Full Redis integration with ioredis
   - Configurable TTL (SHORT: 5min, MEDIUM: 30min, LONG: 1hour, DAY: 24hours)
   - Pattern-based cache invalidation
   - Graceful fallback when Redis is unavailable

2. **Cache Metrics** (`src/services/cache/cache-metrics.ts`)
   - Hit/miss tracking per endpoint
   - Aggregate statistics
   - Performance monitoring

3. **PSGC Cache Service** (`src/services/cache/psgc-cache.ts`)
   - 24-hour TTL for PSGC data (rarely changes)
   - Dual indexing (by ID and code)
   - Batch operations support

4. **Route Integration**
   - Addresses GET endpoints: 5-minute cache
   - Phone-numbers GET endpoints: 5-minute cache
   - Automatic invalidation on POST/PUT/DELETE/PATCH
   - Cache headers in all responses

5. **Admin Endpoints**
   - GET /api/cache/stats - Detailed metrics (admin only)
   - GET /api/cache/stats/summary - Quick overview (admin only)
   - DELETE /api/cache - Flush all cache (admin only)

6. **Rate Limiting**
   - Applied to all addresses and phone-numbers routes
   - 100 requests per minute per user
   - Rate limit headers in all responses

**Performance Improvements:**
- Cached requests: ~10-50ms response time
- Reduced database load
- Cache hit rate tracking available

**Testing:**
- Integration tests for cache behavior
- Rate limiting tests
- Cache invalidation verified

---

**Last Updated:** 2026-04-08
**Status:** ✅ Implemented and tested
**Dependencies:** Redis (ioredis v5.10.1)
