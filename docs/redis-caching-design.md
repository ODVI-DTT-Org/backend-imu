# Redis Caching Design Documentation

> **Redis Caching Implementation for IMU Backend**
> **Implementation Date:** 2026-04-14
> **Version:** 1.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Cache Keys and TTL Strategy](#3-cache-keys-and-ttl-strategy)
4. [Cache Operations](#4-cache-operations)
5. [Cache Invalidation](#5-cache-invalidation)
6. [Background Jobs](#6-background-jobs)
7. [Performance Impact](#7-performance-impact)
8. [Operational Guidelines](#8-operational-guidelines)
9. [Monitoring and Debugging](#9-monitoring-and-debugging)
10. [Future Enhancements](#10-future-enhancements)

---

## 1. Overview

### Purpose

The Redis caching layer reduces database load and improves response times for frequently accessed data, specifically:
- **Assigned client IDs** for Caravan/Tele users
- **Touchpoint summaries** for client progress tracking
- **Area assignments** for user-based filtering

### Goals

- Reduce average response time for assigned clients API from ~2000ms to ~50ms
- Minimize database load during peak usage (300k+ clients)
- Provide consistent performance regardless of data size
- Maintain data freshness with appropriate TTLs

### Non-Goals

- Caching for All Clients API (PostgreSQL optimization handles this)
- Caching for other entities (users, agencies, etc.)
- Real-time cache consistency (eventual consistency is acceptable)

---

## 2. Architecture

### System Diagram

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Flutter Mobile  │────▶│  Hono API    │────▶│  PostgreSQL  │
│                  │     │              │     │             │
│  (Caravan/Tele)  │     │  /api/clients│     │  300k+      │
└─────────────────┘     │              │     │  clients     │
                               └──────┬───────┘     └──────▲──────┘
                                       │                   │
                                      ▼                   │
                            ┌────────────────────────┐
                            │     Redis Cache Layer    │
                            │  - ClientsCacheService  │
                            │  - CacheInvalidation    │
                            │  - Background Jobs     │
                            └───────────┬────────────┘
                                        │
                    ┌───────────────────┴─────────────┐
                    │  Scheduled Background Jobs     │
                    │  - Cache Warming (6 AM)         │
                    │  - MV Refresh (5 min)          │
                    └──────────────────────────────────┘
```

### Component Architecture

```
src/services/cache/
├── clients-cache.ts           # Main cache service
├── client-cache-invalidation.ts  # Invalidation hooks
└── redis-cache.ts            # Generic Redis wrapper

src/services/
├── cache-warming.ts           # Cache warming job
├── touchpoint-mv-refresh.ts    # MV refresh job
└── cronScheduler.ts            # Job scheduler

src/routes/
├── clients.ts                  # API endpoints with cache integration
└── touchpoints.ts              # Mutation endpoints with invalidation
```

---

## 3. Cache Keys and TTL Strategy

### Key Format

All cache keys use a versioned prefix for future migrations:

```
v1:clients:<entity_type>:<identifier>
```

**Why versioning?**
- Allows breaking changes to cache structure
- Enables cache migration without data loss
- Simple version bump (v1 → v2) when schema changes

### Cache Keys and TTLs

| Key Pattern | Purpose | TTL | Rationale |
|------------|---------|-----|-----------|
| `v1:clients:user:assigned_ids:{user_id}` | Assigned client IDs | 12h (43200s) | Area assignments change infrequently |
| `v1:clients:user:assigned_areas:{user_id}` | User's assigned areas | 1h (3600s) | Area changes rare |
| `v1:clients:client:touchpoint_summary:{client_id}` | Touchpoint summary | 5m (300s) | Touchpoints change frequently |
| `v1:clients:lock:{cache_key}` | Stampede prevention lock | 10s | Short lock timeout |

### TTL Decision Rationale

**Assigned Client IDs (12h):**
- Area assignments change rarely (daily or less)
- Acceptable to show slightly stale data for 12 hours
- Reduces cache warming frequency

**Touchpoint Summary (5m):**
- Touchpoints are created throughout the day
- MV refreshes every 5 minutes anyway
- Balances freshness with cache hit rate

**Lock (10s):**
- Prevents stampede during concurrent requests
- Short timeout prevents deadlocks
- Long enough for DB query to complete

---

## 4. Cache Operations

### Cache-Aside Pattern

```
┌──────────────┐
│  API Request │
└──────┬───────┘
       │
       ▼
    ┌─────────────────┐
    │ Check Redis     │
    └────┬────────────┘
         │
    ┌────┴────┐
    │ Hit?    │
    └────┬────┘
       │
   ┌───┴────┐
   │ NO     │ YES
   ▼        ▼
┌────────┐ ┌──────┐
│ Query │ │Return│
│  DB   │ │ Cache│
└───┬────┘ └──────┘
    │
    ▼
┌────────────┐
│ Populate   │
│   Cache    │
└────────────┘
```

### Code Example

```typescript
// Check cache first
const cachedIds = await clientsCache.getAssignedClientIds(userId);

if (cachedIds) {
  // Cache HIT - return immediately
  return { clientIds: cachedIds, source: 'cache' };
}

// Cache MISS - query database and populate cache
const result = await db.query('SELECT client_id FROM ...');

// Populate cache for next request
await clientsCache.setAssignedClientIds(userId, result.clientIds, areas);

return { clientIds: result.clientIds, source: 'db' };
```

### Batch Operations

**Batch Get (MGET):**
```typescript
// Get summaries for multiple clients in one Redis call
const summaries = await clientsCache.getTouchpointSummaries(clientIds);
// Returns: Map<clientId, TouchpointSummary>
```

**Batch Set (Pipeline):**
```typescript
// Set multiple summaries efficiently
await clientsCache.setTouchpointSummaries(summaryMap);
// Uses Redis pipeline for atomic operation
```

---

## 5. Cache Invalidation

### Inheritance Flow

```
Touchpoint Created/Updated/Deleted
           │
           ▼
    ┌────────────────────────┐
    │ ClientCacheInvalidation  │
    │  - onTouchpointCreated  │
    │  - onTouchpointUpdated  │
    │  - onTouchpointDeleted  │
    └────────┬───────────────┘
             │
             ▼
    ┌────────────────────────┐
    │ Non-Blocking Async      │
    │  (doesn't slow request)  │
    └────────┬───────────────┘
             │
    ┌────────▼─────────────┐
    │ Invalidate Cache Keys   │
    │  - touchpoint_summary  │
    │  - user:assigned_ids  │
    └────────────────────────┘
```

### Invalidation Triggers

| Event | Invalidation | Rationale |
|-------|--------------|-----------|
| Touchpoint created | Summary + User cache | New touchpoint changes counts and next type |
| Touchpoint updated | Summary | Status or type changed |
| Touchpoint deleted | Summary + User cache | Client may have fewer touchpoints |
| Bulk touchpoints | Multiple summaries | Batch invalidation for efficiency |
| Area assignment changed | User cache | Assigned clients changed |

### Code Example

```typescript
// Invalidation after touchpoint creation
cacheInvalidation.onTouchpointCreated(clientId, userId)
  .catch((error) => {
    console.error('Cache invalidation error:', error);
  });
// Non-blocking - doesn't wait for invalidation to complete
```

---

## 6. Background Jobs

### Job 1: Cache Warming (Daily at 6 AM)

**Purpose:** Pre-populate cache before users start their day

**Schedule:** `0 6 * * *` (daily at 6:00 AM)

**Process:**
```
For each Caravan/Tele user:
  1. Get assigned areas from user_locations
  2. Query assigned client IDs using MV
  3. Store in cache with 12h TTL
```

**Benefits:**
- First request of the day is fast (cache hit)
- No cold starts for users
- Consistent performance from day start

**Code:** `src/services/cache-warming.ts`

### Job 2: Materialized View Refresh (Every 5 minutes)

**Purpose:** Keep touchpoint summaries fresh

**Schedule:** `*/5 * * * *` (every 5 minutes)

**Process:**
```
1. REFRESH MATERIALIZED VIEW CONCURRENTLY client_touchpoint_summary_mv
2. Get row count for logging
3. Log success/failure statistics
```

**Benefits:**
- Touchpoint data is never more than 5 minutes stale
- CONCURRENTLY allows reads during refresh
- No downtime for cache refresh

**Code:** `src/services/touchpoint-mv-refresh.ts`

### Job Management

**Starting Jobs:** (automatic on app startup)
```typescript
// In src/index.ts or similar
import { startScheduler } from './services/cronScheduler.js';

// Start scheduler when app starts
startScheduler();
```

**Manual Triggering:**
```typescript
// For testing or manual execution
import { triggerTask } from './services/cronScheduler.js';

await triggerTask('cacheWarming');
await triggerTask('touchpointMVRefresh');
```

---

## 7. Performance Impact

### Expected Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Assigned Clients API (cold)** | ~2000ms | ~50ms | 40x faster |
| **Assigned Clients API (warm)** | ~2000ms | ~10ms | 200x faster |
| **Database Queries (peak)** | High | Reduced 90% | Better scalability |
| **Memory Usage** | Baseline | +50MB | Acceptable for 300k clients |

### Cache Hit Rate Targets

- **Warm cache (after 6 AM job):** 95%+ hit rate
- **During day (with invalidation):** 85%+ hit rate
- **First request of day:** 0% (cold start, but warming helps)

### Scalability

| Concurrent Users | Before | After | Improvement |
|-----------------|--------|-------|-------------|
| 10 users | ~2000ms | ~50ms | 40x faster |
| 100 users | ~5000ms | ~100ms | 50x faster |
| 1000 users | ~10000ms | ~500ms | 20x faster |

**Note:** Performance gains are most significant at scale. With caching, the system handles 1000 users as easily as 100.

---

## 8. Operational Guidelines

### Deployment Checklist

**1. Environment Variables:**
```bash
REDIS_URL=redis://host:port/db
REDIS_ENABLED=true
REDIS_DB_INDEX=0
REDIS_KEY_PREFIX=imu:qa:
REDIS_TLS=true
```

**2. Database Migrations:**
- Run migration 063 (client search indexes)
- Run migration 064 (touchpoint summary MV)

**3. Restart Application:**
- Background jobs start automatically
- Cache warming runs at next 6 AM schedule

**4. Verify:**
```bash
# Check Redis connection
redis-cli -u url PING

# Check scheduled jobs
curl http://localhost:4000/api/jobs/status

# Verify cache is working
curl http://localhost:4000/api/clients/assigned -H "Authorization: Bearer $TOKEN"
```

### Monitoring

**Key Metrics to Monitor:**
- Cache hit rate (target: 85%+)
- Cache miss rate (should be < 15%)
- Redis memory usage
- Background job execution time
- Materialized view refresh time

**Alert Thresholds:**
- Cache hit rate < 70% → Investigate
- Background job fails > 3 times → Alert
- MV refresh > 30 seconds → Alert
- Redis memory > 80% → Scale or add eviction policy

### Troubleshooting

**Cache not working:**
1. Check Redis is running: `redis-cli ping`
2. Check REDIS_ENABLED=true
3. Check application logs for cache errors
4. Verify cache keys exist: `redis-cli KEYS "v1:clients:*"`

**Stale data:**
1. Check when MV was last refreshed
2. Check background job execution logs
3. Manually trigger MV refresh: `triggerTask('touchpointMVRefresh')`

**Slow first request:**
1. Verify cache warming job ran at 6 AM
2. Manually warm cache: `triggerTask('cacheWarming')`
3. Check Redis memory for cache key

---

## 9. Monitoring and Debugging

### Log Messages

**Cache Operations:**
```
[ClientsCache] Cached 150 client IDs for user user-123
[ClientsCache] Cache HIT for user user-123
[ClientsCache] Cache MISS for user user-123
[ClientsCache] Invalidated touchpoint summary for client client-456
```

**Background Jobs:**
```
[MVRefresh] Materialized view refreshed successfully: {row_count: 300000, duration_ms: 8523}
[CacheWarming] Cache warming complete: {total_users: 150, successful_warms: 148, duration_ms: 45230}
```

**Debug Commands:**

```bash
# Check Redis cache keys
redis-cli KEYS "v1:clients:*"

# Get specific cache value
redis-cli GET "v1:clients:user:assigned_ids:user-123"

# Check TTL of a key
redis-cli TTL "v1clients:user:assigned_ids:user-123"

# Monitor Redis in real-time
redis-cli MONITOR

# Check Redis memory usage
redis-cli INFO memory
```

### Performance Testing

**Load Test Script:**
```bash
# Install wrk first
wrk -t 30s -c 10 --latency \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/clients/assigned
```

**Expected Results:**
- **Latency:** P50 < 100ms, P99 < 500ms
- **Throughput:** >100 req/s with caching
- **Error rate:** < 1%

---

## 10. Future Enhancements

### Potential Improvements

**1. Extended Caching:**
- Cache paginated results
- Cache filtered queries by client_type, product_type
- Cache All Clients API for common filters

**2. Advanced Features:**
- Cache预热 (Cache warming on demand)
- Distributed lock timeout
- Cache metrics dashboard
- Automatic cache size tuning

**3. Performance:**
- Redis Cluster for high availability
- Redis Sentinel for failover
- Local cache layer (in-memory)
- Compression for large cache values

**4. Monitoring:**
- Prometheus metrics export
- Grafana dashboard
- Cache hit rate alerts
- Slow query logging

### Migration Path

**Version 1 → Version 2:**
```typescript
// Current (v1)
const key = 'v1:clients:user:assigned_ids:user-123';

// Future (v2) - Add region-based sharding
const key = 'v2:clients:region:pampanga:user:assigned_ids:user-123';
```

**Cache Migration Strategy:**
1. Deploy v2 code with dual-write (v1 + v2)
2. Run migration job to populate v2 cache
3. Switch reads to v2 cache
4. Stop writing to v1 cache
5. Let v1 keys expire naturally

---

## Appendix A: Cache Key Reference

### Full Key List

```
# Assigned Client IDs
v1:clients:user:assigned_ids:{user_id}

# Assigned Areas
v1:clients:user:assigned_areas:{user_id}

# Touchpoint Summary
v1:clients:client:touchpoint_summary:{client_id}

# Lock Keys
v1:clients:lock:{cache_key}
```

### Example Keys

```
v1:clients:user:assigned_ids:550e8400-e29b-41d4-a716-446655440000
v1:clients:user:assigned_areas:550e8400-e29b-41d4-a716-446655440000
v1:clients:client:touchpoint_summary:123e4567-e89b-12d3-a456-426614174000
v1:clients:lock:user:assigned_ids:550e8400-e29b-41d4-a716-446655440000
```

---

## Appendix B: Troubleshooting Guide

### Common Issues

**Issue 1: Cache not working on DigitalOcean**
- **Symptom:** Cache miss on every request
- **Cause:** dotenv fallback in production
- **Fix:** Ensure `NODE_ENV=production` in DigitalOcean environment

**Issue 2: Stale touchpoint data**
- **Symptom:** Touchpoint count is 0 despite having touchpoints
- **Cause:** Materialized view not refreshed
- **Fix:** Check MV refresh job is running, manually trigger refresh

**Issue 3: Slow first request**
- **Symptom:** First request of the day is slow
- **Cause:** Cache not warmed
- **Fix:** Check cache warming job ran at 6 AM

**Issue 4: Redis connection errors**
- **Symptom:** "Redis connection refused"
- **Cause:** Redis not running or wrong URL
- **Fix:** Verify REDIS_URL, check Redis service status

### Debug Commands

```bash
# Check Redis connection
curl http://localhost:4000/api/health

# Check cache keys
redis-cli KEYS "v1:clients:*" | wc -l

# Monitor Redis operations
redis-cli MONITOR | grep "v1:clients"

# Get specific cache value
redis-cli --scan --pattern "v1:clients:user:*"

# Check TTL
redis-cli TTL "v1:clients:user:assigned_ids:user-id"

# Clear all cache (use with caution!)
redis-cli FLUSHDB
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| **Version** | 1.0 |
| **Last Updated** | 2026-04-14 |
| **Author** | IMU Development Team |
| **Status** | Implemented |
| **Related Docs** | Redis caching implementation plan |

---

**End of Redis Caching Design Documentation**
