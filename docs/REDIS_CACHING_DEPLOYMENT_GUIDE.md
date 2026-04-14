# Redis Caching Deployment Guide

> **IMU Backend Redis Caching** - Production Deployment Guide
> **Version:** 1.0
> **Last Updated:** 2026-04-14

---

## Table of Contents

1. [Overview](#1-overview)
2. [Redis Setup Options](#2-redis-setup-options)
3. [Configuration](#3-configuration)
4. [Deployment Checklist](#4-deployment-checklist)
5. [Monitoring](#5-monitoring)
6. [Troubleshooting](#6-troubleshooting)
7. [Maintenance](#7-maintenance)

---

## 1. Overview

This guide covers deploying the IMU backend with Redis caching enabled. Redis caching provides:

- **40x faster response times** for assigned clients API (2000ms → 50ms)
- **90% reduction** in database load during peak usage
- **Automatic cache warming** via background jobs
- **Touchpoint data freshness** with 5-minute materialized view refresh

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Flutter    │────▶│  Hono API    │────▶│ PostgreSQL  │
│  Mobile App │     │              │     │  300k+      │
└─────────────┘     │  /api/clients│     │  clients    │
                    └──────┬───────┘     └──────▲──────┘
                           │                   │
                          ▼                   │
                    ┌─────────────┐           │
                    │ Redis Cache │───────────┘
                    │ - Client IDs│  MV Refresh
                    │ - Summaries│  (every 5min)
                    └─────────────┘  Cache Warming
                                     (daily 6 AM)
```

---

## 2. Redis Setup Options

### Option 1: Docker (Recommended for Development)

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  redis_data:
```

**Start:**
```bash
docker-compose up -d redis
```

**Verify:**
```bash
docker-compose exec redis redis-cli ping
# Output: PONG
```

### Option 2: Local Installation (Development)

**macOS:**
```bash
brew install redis
brew services start redis

# Verify
redis-cli ping
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis
sudo systemctl enable redis

# Verify
redis-cli ping
```

**Windows (WSL2):**
```bash
sudo apt-get install redis-server
sudo service redis-server start

# Verify
redis-cli ping
```

### Option 3: Redis Cloud (Production)

**Redis Cloud:**
1. Sign up at https://redis.com/try-free/
2. Create a new database
3. Get connection string (Redis URL)
4. Enable TLS for production

**Environment Variables:**
```bash
REDIS_URL=rediss://username:password@host:port/db
REDIS_ENABLED=true
REDIS_TLS=true
```

### Option 4: Azure Cache for Redis

**Create Azure Cache:**
```bash
# Create resource
az redis create \
  --name imu-cache \
  --resource-group imu-rg \
  --location eastus \
  --sku Basic \
  --vm-size c0

# Get connection string
az redis show-keys --name imu-cache --resource-group imu-rg
```

**Environment Variables:**
```bash
REDIS_URL=rediss://:<primary-key>@imu-cache.redis.cache.windows.net:6380/0
REDIS_ENABLED=true
REDIS_TLS=true
```

### Option 5: AWS ElastiCache

**Create ElastiCache Cluster:**
```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id imu-cache \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --security-group-ids sg-xxx
```

---

## 3. Configuration

### Environment Variables

Add to `.env` file:

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379/0
REDIS_ENABLED=true
REDIS_DB_INDEX=0
REDIS_KEY_PREFIX=imu:prod:
REDIS_TLS=false

# Cache TTLs (optional - defaults shown)
CACHE_TTL_ASSIGNED_CLIENT_IDS=43200  # 12 hours
CACHE_TTL_TOUCHPOINT_SUMMARY=300     # 5 minutes
CACHE_TTL_ASSIGNED_AREAS=3600        # 1 hour
CACHE_TTL_LOCK=10                    # 10 seconds
```

### Redis Configuration (redis.conf)

**Production Settings:**
```conf
# Memory
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence (AOF - recommended)
appendonly yes
appendfsync everysec

# Snapshots (RDB - optional backup)
save 900 1
save 300 10
save 60 10000

# Security
# requirepass your-redis-password

# TLS (for production)
# tls-port 6379
# tls-cert-file /path/to/redis.crt
# tls-key-file /path/to/redis.key
# tls-ca-cert-file /path/to/ca.crt
```

### Application Code

**src/services/cache/redis-cache.ts:**
```typescript
export const getRedisCache = (): RedisCache => {
  const enabled = process.env.REDIS_ENABLED === 'true';

  if (!enabled) {
    console.log('[RedisCache] Redis caching disabled');
    return new NoOpCache();
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required when REDIS_ENABLED=true');
  }

  // Create Redis client
  const client = createRedisClient(redisUrl);
  return new RedisCacheImpl(client);
};
```

---

## 4. Deployment Checklist

### Pre-Deployment

- [ ] Redis instance is running and accessible
- [ ] Redis URL is configured in environment
- [ ] Redis persistence is enabled (AOF)
- [ ] Redis memory limit is configured
- [ ] Database migrations are applied:
  - [ ] Migration 063: Client search indexes
  - [ ] Migration 064: Touchpoint summary MV
- [ ] Background jobs are enabled
- [ ] Monitoring is configured

### Deployment Steps

**1. Verify Redis Connection:**
```bash
# Test connection
redis-cli -u $REDIS_URL ping

# Check memory
redis-cli -u $REDIS_URL INFO memory

# Check keys
redis-cli -u $REDIS_URL KEYS "v1:clients:*"
```

**2. Run Database Migrations:**
```bash
# Apply migrations
psql -d imu -f migrations/063_client_search_indexes.sql
psql -d imu -f migrations/064_touchpoint_summary_mv.sql

# Verify MV exists
psql -d imu -c "\d+ client_touchpoint_summary_mv"
```

**3. Start Application:**
```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start
```

**4. Verify Background Jobs:**
```bash
# Check scheduler status
curl http://localhost:4000/api/jobs/status

# Expected output:
{
  "running": true,
  "activeJobs": [
    "actionItemsRefresh",
    "touchpointMVRefresh",
    "cacheWarming"
  ],
  "tasks": { ... }
}
```

**5. Test Cache Functionality:**
```bash
# First request (cache miss)
curl http://localhost:4000/api/clients/assigned \
  -H "Authorization: Bearer $TOKEN"

# Second request (cache hit - should be faster)
curl http://localhost:4000/api/clients/assigned \
  -H "Authorization: Bearer $TOKEN"

# Check cache keys
redis-cli KEYS "v1:clients:user:assigned_ids:*"
```

### Post-Deployment

- [ ] Verify cache warming job runs at 6 AM
- [ ] Verify MV refresh job runs every 5 minutes
- [ ] Monitor cache hit rate (target: 85%+)
- [ ] Monitor Redis memory usage
- [ ] Set up alerts for:
  - [ ] Cache hit rate < 70%
  - [ ] Background job failures
  - [ ] MV refresh > 30 seconds
  - [ ] Redis memory > 80%

---

## 5. Monitoring

### Key Metrics

**Cache Performance:**
- Cache hit rate (target: 85%+)
- Cache miss rate (should be < 15%)
- Average response time (target: < 100ms with cache)
- Cache stampede rate (should be near 0)

**Redis Health:**
- Memory usage (alert if > 80%)
- Connected clients
- Commands per second
- Key count
- Evictions per second

**Background Jobs:**
- Cache warming execution time
- MV refresh execution time
- Job success/failure rate
- Last successful run time

### Monitoring Tools

**Redis CLI:**
```bash
# Memory usage
redis-cli INFO memory

# Key statistics
redis-cli INFO stats

# Connected clients
redis-cli INFO clients

# Slow log (slow queries)
redis-cli SLOWLOG GET 10
```

**Application Logs:**
```bash
# Cache operations
grep "ClientsCache" logs/app.log

# Background jobs
grep "MVRefresh\|CacheWarming" logs/app.log

# Cache hit/miss
grep "Cache HIT\|Cache MISS" logs/app.log
```

**Monitoring Commands:**
```bash
# Real-time monitoring
redis-cli MONITOR | grep "v1:clients"

# Key count by pattern
redis-cli --scan --pattern "v1:clients:*" | wc -l

# TTL distribution
redis-cli --scan --pattern "v1:clients:*" | \
  xargs -I {} redis-cli TTL {}
```

### Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Cache hit rate | < 80% | < 70% | Investigate cache configuration |
| Redis memory | > 70% | > 80% | Scale or add eviction policy |
| MV refresh time | > 20s | > 30s | Optimize MV query |
| Background job failures | 2 in row | 3 in row | Restart job, investigate |
| Cache stampede | > 1/min | > 5/min | Increase lock timeout |

---

## 6. Troubleshooting

### Issue: Cache Not Working

**Symptoms:**
- All requests are slow
- No cache keys in Redis
- Logs show "Cache MISS" for every request

**Diagnosis:**
```bash
# Check Redis connection
redis-cli -u $REDIS_URL ping

# Check if cache is enabled
echo $REDIS_ENABLED

# Check application logs
grep "RedisCache" logs/app.log
```

**Solutions:**
1. Redis not running: Start Redis service
2. Wrong REDIS_URL: Check connection string
3. REDIS_ENABLED=false: Set to true
4. Network issue: Check firewall/security groups

### Issue: Stale Data

**Symptoms:**
- Touchpoint counts are incorrect
- New clients not appearing
- Old data showing after updates

**Diagnosis:**
```bash
# Check last MV refresh
curl http://localhost:4000/api/jobs/last-refresh

# Check MV row count
psql -d imu -c "SELECT COUNT(*) FROM client_touchpoint_summary_mv"

# Manual MV refresh
curl -X POST http://localhost:4000/api/jobs/trigger/touchpointMVRefresh
```

**Solutions:**
1. MV refresh job not running: Check cron scheduler
2. Cache invalidation not working: Check invalidation hooks
3. Long-running transaction: Check for blocking queries

### Issue: Slow First Request

**Symptoms:**
- First request of the day is slow
- Subsequent requests are fast
- Cache warming didn't run

**Diagnosis:**
```bash
# Check if cache warming ran
curl http://localhost:4000/api/jobs/status

# Manually trigger cache warming
curl -X POST http://localhost:4000/api/jobs/trigger/cacheWarming

# Check cache keys
redis-cli KEYS "v1:clients:user:assigned_ids:*" | wc -l
```

**Solutions:**
1. Cache warming job didn't run: Check cron schedule
2. No users in database: Check user_locations table
3. Job failed: Check job logs for errors

### Issue: High Memory Usage

**Symptoms:**
- Redis using > 80% memory
- Frequent evictions
- Out of memory errors

**Diagnosis:**
```bash
# Check memory usage
redis-cli INFO memory | grep used_memory_human

# Check eviction policy
redis-cli CONFIG GET maxmemory-policy

# Check key count
redis-cli DBSIZE
```

**Solutions:**
1. Reduce TTL values
2. Add maxmemory-policy (allkeys-lru)
3. Increase Redis memory limit
4. Scale to Redis Cluster

### Issue: Cache Stampede

**Symptoms:**
- Multiple concurrent requests hit DB
- High CPU usage
- Slow response times

**Diagnosis:**
```bash
# Check lock keys
redis-cli KEYS "v1:clients:lock:*"

# Check concurrent requests
redis-cli --scan --pattern "v1:clients:lock:*" | wc -l
```

**Solutions:**
1. Lock timeout too short: Increase CACHE_TTL_LOCK
2. Lock not releasing: Check lock release logic
3. High concurrency: Increase cache warming frequency

---

## 7. Maintenance

### Daily Tasks

- [ ] Check Redis memory usage
- [ ] Verify background jobs ran successfully
- [ ] Review cache hit rate
- [ ] Check for any cache errors

### Weekly Tasks

- [ ] Review slow query log
- [ ] Analyze cache key patterns
- [ ] Check for unused keys
- [ ] Review TTL settings

### Monthly Tasks

- [ ] Redis performance review
- [ ] Cache hit rate analysis
- [ ] Memory usage trends
- [ ] Backup verification

### Backup and Recovery

**Redis Backup (RDB + AOF):**
```bash
# Create snapshot
redis-cli BGSAVE

# Copy AOF file
cp /var/lib/redis/appendonly.aof /backup/redis-$(date +%Y%m%d).aof

# Copy RDB file
cp /var/lib/redis/dump.rdb /backup/redis-$(date +%Y%m%d).rdb
```

**Redis Restore:**
```bash
# Stop Redis
redis-cli SHUTDOWN

# Restore from backup
cp /backup/redis-YYYYMMDD.aof /var/lib/redis/appendonly.aof
cp /backup/redis-YYYYMMDD.rdb /var/lib/redis/dump.rdb

# Start Redis
redis-server /etc/redis/redis.conf
```

### Scaling

**Vertical Scaling (More Memory):**
```bash
# Update Redis config
maxmemory 512mb  # Increase from 256mb
```

**Horizontal Scaling (Redis Cluster):**
```bash
# Create cluster
redis-cli --cluster create \
  host1:6379 host2:6379 host3:6379 \
  --cluster-replicas 1
```

**Read Replicas:**
```bash
# Add read replica
redis-cli --slaveof master-host 6379
```

---

## Appendix: Quick Reference

### Redis Commands

```bash
# Connection
redis-cli ping                                    # Check connection
redis-cli -u url ping                             # Check with URL

# Keys
redis-cli KEYS "pattern*"                         # List keys
redis-cli GET key                                 # Get value
redis-cli SET key value                           # Set value
redis-cli DEL key                                 # Delete key
redis-cli TTL key                                 # Check time-to-live

# Memory
redis-cli INFO memory                             # Memory stats
redis-cli CONFIG GET maxmemory                    # Memory limit
redis-cli CONFIG SET maxmemory 256mb              # Set limit

# Operations
redis-cli FLUSHDB                                 # Clear current DB
redis-cli FLUSHALL                                # Clear all DBs
redis-cli DBSIZE                                 # Count keys

# Monitoring
redis-cli MONITOR                                 # Real-time commands
redis-cli SLOWLOG GET 10                         # Slow queries
redis-cli INFO stats                             # Statistics
```

### Application Endpoints

```bash
# Jobs status
GET /api/jobs/status

# Manual trigger
POST /api/jobs/trigger/touchpointMVRefresh
POST /api/jobs/trigger/cacheWarming

# Last refresh time
GET /api/jobs/last-refresh
```

### Cache Keys

```
v1:clients:user:assigned_ids:{user_id}           # Assigned client IDs
v1:clients:user:assigned_areas:{user_id}         # User's assigned areas
v1:clients:client:touchpoint_summary:{client_id} # Touchpoint summary
v1:clients:lock:{cache_key}                      # Stampede prevention lock
```

---

**Document Version:** 1.0
**Last Updated:** 2026-04-14
**Related Documentation:**
- [Redis Caching Design](redis-caching-design.md)
- [Environment Variables](ENVIRONMENT.md)
- [API Documentation](../README.md)
