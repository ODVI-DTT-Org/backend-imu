# IMU Backend API

Backend API for IMU mobile app using Hono + PostgreSQL + JWT authentication with Redis caching.

## Features

- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **PowerSync Integration**: Sync framework for offline-first mobile apps
- **Redis Caching**: High-performance caching layer for frequently accessed data
- **Role-Based Access Control (RBAC)**: Admin, Area Manager, Assistant Area Manager, Caravan, Tele roles
- **Materialized Views**: Optimized queries for touchpoint summaries
- **Background Jobs**: Automated cache warming and data refresh

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+ (for caching)
- pnpm

### Installation

```bash
cd backend
pnpm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/imu

# JWT Authentication
JWT_SECRET=your-256-bit-secret-key
JWT_EXPIRY_HOURS=720
JWT_REFRESH_EXPIRY_DAYS=30

# Redis Caching
REDIS_URL=redis://localhost:6379/0
REDIS_ENABLED=true
REDIS_DB_INDEX=0
REDIS_KEY_PREFIX=imu:dev:
REDIS_TLS=false

# Server
PORT=3000
NODE_ENV=development
```

### Database Setup

1. Create PostgreSQL database:
```sql
CREATE DATABASE imu;
```

2. Run migrations:
```bash
# Run all migrations
psql -d imu -f migrations/001_initial_schema.sql
psql -d imu -f migrations/063_client_search_indexes.sql
psql -d imu -f migrations/064_touchpoint_summary_mv.sql
```

### Redis Setup

**Option 1: Docker**
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

**Option 2: Local Installation**
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

### Development

```bash
pnpm dev
```

Server runs at http://localhost:3000

## Redis Caching

### Overview

The IMU backend implements Redis caching to improve performance for frequently accessed data:

- **Assigned Client IDs**: Cached for Caravan/Tele users (12h TTL)
- **Touchpoint Summaries**: Cached for client progress tracking (5min TTL)
- **Area Assignments**: Cached for user-based filtering (1h TTL)

### Cache Keys

All cache keys use versioned prefix for future migrations:
```
v1:clients:<entity_type>:<identifier>
```

**Examples:**
- `v1:clients:user:assigned_ids:{user_id}` - Assigned client IDs
- `v1:clients:user:assigned_areas:{user_id}` - User's assigned areas
- `v1:clients:client:touchpoint_summary:{client_id}` - Touchpoint summary

### Background Jobs

Two cron jobs run automatically:

1. **Cache Warming** (Daily at 6 AM)
   - Pre-populates cache for all Caravan/Tele users
   - Prevents slow first requests of the day
   - Command: `0 6 * * *`

2. **Materialized View Refresh** (Every 5 minutes)
   - Refreshes touchpoint summary data
   - Keeps cached summaries fresh
   - Command: `*/5 * * * *`

### Manual Cache Operations

```bash
# Check Redis keys
redis-cli KEYS "v1:clients:*"

# Get specific cache value
redis-cli GET "v1:clients:user:assigned_ids:user-123"

# Check TTL of a key
redis-cli TTL "v1:clients:user:assigned_ids:user-123"

# Clear all cache (use with caution!)
redis-cli FLUSHDB
```

### Performance Impact

With Redis caching enabled:
- **Assigned Clients API**: 40x faster (2000ms → 50ms)
- **Database Load**: Reduced by 90% during peak usage
- **Cache Hit Rate**: Target 85%+ during normal operations

### Monitoring

Key metrics to monitor:
- Cache hit rate (target: 85%+)
- Redis memory usage
- Background job execution time
- Materialized view refresh time

**Alert Thresholds:**
- Cache hit rate < 70% → Investigate
- Background job fails > 3 times → Alert
- MV refresh > 30 seconds → Alert
- Redis memory > 80% → Scale or add eviction policy

For detailed documentation, see [docs/redis-caching-design.md](docs/redis-caching-design.md)

## API Endpoints

| Endpoint | Method | Description | Cached |
|----------|--------|-------------|--------|
| `/api/health` | GET | Health check | No |
| `/api/auth/login` | POST | Login with email/password | No |
| `/api/auth/refresh` | POST | Refresh access token | No |
| `/api/auth/register` | POST | Register new user | No |
| `/api/auth/me` | GET | Get current user | No |
| `/api/clients/assigned` | GET | Get assigned clients | **Yes** |
| `/api/clients/:id` | GET | Get client details | No |
| `/api/touchpoints` | POST | Create touchpoint | No |
| `/api/upload` | POST | PowerSync upload endpoint | No |

### Login Request

```json
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "role": "field_agent"
  }
}
```

### PowerSync Upload

```json
POST /api/upload
Authorization: Bearer <access_token>
{
  "operations": [
    {
      "table": "clients",
      "op": "PUT",
      "id": "uuid",
      "data": {
        "first_name": "John",
        "last_name": "Doe"
      }
    }
  ]
}
```

## Production

```bash
pnpm build
pnpm start
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET`
- [ ] Configure production Redis with TLS
- [ ] Set up Redis monitoring
- [ ] Configure Redis persistence (AOF)
- [ ] Set up Redis backups
- [ ] Verify background jobs are running
- [ ] Test cache invalidation
- [ ] Configure error tracking

### Troubleshooting

**Cache not working:**
1. Check Redis is running: `redis-cli ping`
2. Check `REDIS_ENABLED=true`
3. Check application logs for cache errors
4. Verify cache keys exist: `redis-cli KEYS "v1:clients:*"`

**Stale data:**
1. Check when MV was last refreshed
2. Check background job execution logs
3. Manually trigger MV refresh

**Slow first request:**
1. Verify cache warming job ran at 6 AM
2. Manually warm cache if needed
3. Check Redis memory for cache keys

For detailed troubleshooting, see [docs/redis-caching-design.md](docs/redis-caching-design.md)
