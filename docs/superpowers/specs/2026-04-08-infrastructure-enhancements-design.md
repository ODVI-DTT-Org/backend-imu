# Infrastructure Enhancements Design

**Date:** 2026-04-08
**Status:** ✅ Approved
**Feature:** Rate Limiting, Redis Caching, Integration Tests for Addresses & Phone Numbers

---

## Overview

This design adds three infrastructure improvements to the addresses and phone numbers feature to enhance security, performance, and reliability:

1. **Rate Limiting** - Apply existing middleware to prevent API abuse
2. **Redis Caching** - Reduce database load with query caching
3. **Integration Tests** - Ensure endpoints work correctly with mocked database

**Scope**: Backend-only improvements (mobile already has 59 passing tests)

---

## Section 1: Rate Limiting

### Approach
Apply existing `apiRateLimit` middleware from `src/middleware/rate-limit.ts`

### Configuration
- **Limit**: 100 requests per minute per IP/user
- **Storage**: In-memory (per-server)
- **Middleware Order**: Rate limit BEFORE authentication (prevents brute force)

### Protected Endpoints

**Addresses Routes (6 endpoints)**:
```
GET    /api/clients/:id/addresses
GET    /api/clients/:id/addresses/:id
POST   /api/clients/:id/addresses
PUT    /api/clients/:id/addresses/:id
DELETE /api/clients/:id/addresses/:id
PATCH  /api/clients/:id/addresses/:id/set-primary
```

**Phone Numbers Routes (6 endpoints)**:
```
GET    /api/clients/:id/phone-numbers
GET    /api/clients/:id/phone-numbers/:id
POST   /api/clients/:id/phone-numbers
PUT    /api/clients/:id/phone-numbers/:id
DELETE /api/clients/:id/phone-numbers/:id
PATCH  /api/clients/:id/phone-numbers/:id/set-primary
```

### Implementation

**File**: `src/routes/addresses.ts`
```typescript
import { apiRateLimit } from '../middleware/rate-limit.js';

// Apply rate limiting BEFORE auth middleware
addresses.use('/clients/:id/addresses/*', apiRateLimit);
addresses.use('/clients/:id/addresses', authMiddleware, async (c) => {
  // ... existing code
});
```

**File**: `src/routes/phone-numbers.ts`
```typescript
import { apiRateLimit } from '../middleware/rate-limit.js';

// Apply rate limiting BEFORE auth middleware
phoneNumbers.use('/clients/:id/phone-numbers/*', apiRateLimit);
phoneNumbers.use('/clients/:id/phone-numbers', authMiddleware, async (c) => {
  // ... existing code
});
```

### Error Response
```json
{
  "success": false,
  "error": "Too many requests",
  "retryAfter": 45
}
```

### Testing Rate Limiting

**Test Case** (integration test):
```typescript
it('returns 429 when rate limit exceeded', async () => {
  // Make 101 requests (exceeds 100/min limit)
  const requests = Array.from({ length: 101 }, (_, i) =>
    app.request(`/clients/${mockClient.id}/addresses`, {
      headers: { Authorization: `Bearer ${mockToken}` },
    })
  );

  const responses = await Promise.all(requests);
  const lastResponse = responses[responses.length - 1];

  expect(lastResponse.status).toBe(429);
  const json = await lastResponse.json();
  expect(json.error).toBe('Too many requests');
  expect(json.retryAfter).toBeGreaterThan(0);
});
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Rate limit storage overflows | Oldest entries evicted (LRU) |
| Server restart | Counter resets to zero |
| Multiple server instances | Each instance has separate counter (known limitation) |

### Trade-offs
| Pros | Cons |
|------|------|
| Simple implementation (middleware exists) | In-memory storage (resets on restart) |
| Consistent with existing auth endpoints | Doesn't work across multiple instances |
| Zero external dependencies | Per-server counters only |

---

## Section 2: Redis Caching

### Approach
Implement Redis-backed caching service using `ioredis` (already installed in package.json)

### Architecture
```
Request → Check Cache → Hit? → Return Cached Data
                    → Miss? → Query DB → Cache Result → Return Data
```

### Cache Keys
```
addresses:client:{client_id}           # List of addresses (TTL: 300s)
addresses:address:{address_id}         # Single address (TTL: 300s)
phone_numbers:client:{client_id}       # List of phone numbers (TTL: 300s)
phone_numbers:phone:{phone_id}         # Single phone number (TTL: 300s)
psgc:regions                           # All regions (TTL: 3600s)
psgc:provinces:{region}                # Provinces by region (TTL: 3600s)
```

### TTL Strategy
- **Addresses**: 5 minutes (300s) - User data, changes frequently
- **Phone Numbers**: 5 minutes (300s) - User data, changes frequently
- **PSGC Data**: 1 hour (3600s) - Reference data, rarely changes

### Implementation

**Cache Service** (`src/cache/redis_cache.ts`):
```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

export class CacheService {
  /**
   * Get cached data
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null; // Fall back to database
    }
  }

  /**
   * Set cached data with TTL
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error);
      // Silent fail - continue without cache
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error('Cache invalidate error:', error);
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

export const cache = new CacheService();
```

**Usage Example** (`src/routes/addresses.ts`):
```typescript
import { cache } from '../cache/redis_cache.js';

addresses.get('/clients/:id/addresses', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const cacheKey = `addresses:client:${clientId}`;

  // Try cache first
  const result = await cache.cached(
    cacheKey,
    async () => {
      // Cache miss - query database
      const dbResult = await pool.query(
        'SELECT a.*, p.* FROM addresses a LEFT JOIN psgc p ON a.psgc_id = p.id WHERE a.client_id = $1 AND a.deleted_at IS NULL',
        [clientId]
      );
      return dbResult.rows;
    },
    300 // 5 minutes
  );

  return c.json({ success: true, data: result.map(mapRowToAddress) });
});
```

### Cache Invalidation Implementation

**Invalidation Helper Function**:
```typescript
// src/cache/redis_cache.ts

export class CacheService {
  /**
   * Invalidate all caches for a client
   */
  async invalidateClient(clientId: string): Promise<void> {
    await Promise.all([
      this.invalidate(`addresses:client:${clientId}`),
      this.invalidate(`phone_numbers:client:${clientId}`),
    ]);
  }

  /**
   * Invalidate specific address caches
   */
  async invalidateAddress(addressId: string, clientId: string): Promise<void> {
    await Promise.all([
      this.invalidate(`addresses:client:${clientId}`),
      this.invalidate(`addresses:address:${addressId}`),
    ]);
  }

  /**
   * Invalidate specific phone number caches
   */
  async invalidatePhoneNumber(phoneId: string, clientId: string): Promise<void> {
    await Promise.all([
      this.invalidate(`phone_numbers:client:${clientId}`),
      this.invalidate(`phone_numbers:phone:${phoneId}`),
    ]);
  }
}
```

**Usage in Routes** (`src/routes/addresses.ts`):
```typescript
import { cache } from '../cache/redis_cache.js';

// POST - Invalidate client list after creating
addresses.post('/clients/:id/addresses', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  // ... create address ...

  // Invalidate cache
  await cache.invalidate(`addresses:client:${clientId}`);

  return c.json({ success: true, data: newAddress }, 201);
});

// PUT - Invalidate both list and single address
addresses.put('/clients/:id/addresses/:addressId', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const addressId = c.req.param('addressId');
  // ... update address ...

  // Invalidate cache
  await cache.invalidateAddress(addressId, clientId);

  return c.json({ success: true, data: updatedAddress });
});

// DELETE - Invalidate both list and single address
addresses.delete('/clients/:id/addresses/:addressId', authMiddleware, async (c) => {
  const clientId = c.req.param('id');
  const addressId = c.req.param('addressId');
  // ... delete address ...

  // Invalidate cache
  await cache.invalidateAddress(addressId, clientId);

  return c.json({ success: true, message: 'Address deleted' });
});
```

### PSGC Caching

**PSGC Cache Service** (`src/cache/psgc_cache.ts`):
```typescript
import { cache } from './redis_cache.js';

export class PSGCCache {
  /**
   * Get all regions (cached for 1 hour)
   */
  async getRegions(): Promise<any[]> {
    return cache.cached(
      'psgc:regions',
      async () => {
        const result = await pool.query(
          'SELECT DISTINCT region as name, region as code FROM psgc ORDER BY region'
        );
        return result.rows;
      },
      3600 // 1 hour
    );
  }

  /**
   * Get provinces by region (cached for 1 hour)
   */
  async getProvincesByRegion(region: string): Promise<any[]> {
    return cache.cached(
      `psgc:provinces:${region}`,
      async () => {
        const result = await pool.query(
          'SELECT DISTINCT province as name, province as code FROM psgc WHERE region = $1 ORDER BY province',
          [region]
        );
        return result.rows;
      },
      3600 // 1 hour
    );
  }

  /**
   * Invalidate PSGC caches (call after PSGC data update)
   */
  async invalidate(): Promise<void> {
    await cache.invalidate('psgc:*');
  }
}

export const psgcCache = new PSGCCache();
```

### Monitoring & Verification

**Cache Metrics** (`src/cache/cache_metrics.ts`):
```typescript
export class CacheMetrics {
  private static hits = 0;
  private static misses = 0;
  private static errors = 0;

  static recordHit(): void { this.hits++; }
  static recordMiss(): void { this.misses++; }
  static recordError(): void { this.errors++; }

  static getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%',
    };
  }

  static log(): void {
    console.log('Cache Stats:', this.getStats());
  }
}
```

**Updated Cache Service with Metrics**:
```typescript
import { CacheMetrics } from './cache_metrics.js';

async get<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      CacheMetrics.recordHit();
      return JSON.parse(cached);
    }
    CacheMetrics.recordMiss();
    return null;
  } catch (error) {
    CacheMetrics.recordError();
    console.error('Cache get error:', error);
    return null;
  }
}
```

**Verification Endpoint** (admin only):
```typescript
// src/routes/admin.ts
import { CacheMetrics } from '../cache/cache_metrics.js';

admin.get('/cache/stats', authMiddleware, adminOnly, async (c) => {
  return c.json({
    success: true,
    data: CacheMetrics.getStats(),
  });
});
```

### Environment Variables

**Add to `.env.example`**:
```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=              # Optional, if Redis requires auth
REDIS_DB=0                   # Redis database number

# Cache Configuration
CACHE_ENABLED=true           # Enable/disable caching globally
CACHE_TTL_ADDRESSES=300      # 5 minutes
CACHE_TTL_PHONES=300         # 5 minutes
CACHE_TTL_PSGC=3600          # 1 hour
```

**Environment Loading** (`src/cache/redis_cache.ts`):
```typescript
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  // Silent fail if Redis not available
  lazyConnect: true,
});
```

### Error Handling
- **Graceful Degradation**: If Redis is unavailable, fall back to database query
- **Silent Failures**: Log cache errors but don't break requests
- **Connection Retry**: Automatic retry with exponential backoff
- **Lazy Connect**: Redis connection attempted on first use, not startup

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Redis connection fails during request | Falls back to database, logs error, continues |
| Redis memory limit exceeded | LRU eviction of old keys |
| Redis server restart | Cache is lost, repopulated on next requests |
| Malformed JSON in cache | Treats as cache miss, queries database |
| Concurrent cache invalidations | All invalidations succeed, last write wins |

### Testing Cache Behavior

**Integration Test**:
```typescript
describe('Address Caching', () => {
  it('caches address list on first request', async () => {
    const response1 = await app.request(`/clients/${mockClient.id}/addresses`, {
      headers: { Authorization: `Bearer ${mockToken}` },
    });

    // Should hit database
    expect(mockPool.query).toHaveBeenCalled();

    vi.clearAllMocks();

    const response2 = await app.request(`/clients/${mockClient.id}/addresses`, {
      headers: { Authorization: `Bearer ${mockToken}` },
    });

    // Should hit cache (no database call)
    expect(mockPool.query).not.toHaveBeenCalled();
    expect(response1.status).toBe(response2.status);
  });

  it('invalidates cache after creating address', async () => {
    // First request - cache miss
    await app.request(`/clients/${mockClient.id}/addresses`, {
      headers: { Authorization: `Bearer ${mockToken}` },
    });

    vi.clearAllMocks();

    // Create new address
    await app.request(`/clients/${mockClient.id}/addresses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mockToken}` },
      body: JSON.stringify({ psgc_id: 1, label: 'Home', street_address: 'New' }),
    });

    vi.clearAllMocks();

    // Next request should hit database (cache was invalidated)
    await app.request(`/clients/${mockClient.id}/addresses`, {
      headers: { Authorization: `Bearer ${mockToken}` },
    });

    expect(mockPool.query).toHaveBeenCalled();
  });
});
```

### Trade-offs
| Pros | Cons |
|------|------|
| 10-50ms cached vs 200-500ms DB | Requires Redis server |
| Reduced database load | Stale data possible (mitigated by TTL) |
| Simple implementation | Additional infrastructure |
| Graceful fallback | Need to monitor cache hit rate |

---

## Section 3: Integration Tests

### Approach
Use mocked database with test fixtures (fast, no external dependencies)

### Test Structure
```
src/tests/integration/
├── setup.ts                    # Test initialization
├── addresses.integration.test.ts
├── phone-numbers.integration.test.ts
├── rate-limit.integration.test.ts
└── fixtures/
    ├── clients.ts
    ├── addresses.ts
    ├── phone-numbers.ts
    ├── psgc.ts
    └── tokens.ts
```

### Test Coverage

**Addresses (10 tests)**:
1. ✅ GET list - returns client's addresses
2. ✅ GET list - includes pagination metadata
3. ✅ GET single - returns address by ID
4. ✅ GET single - 404 if not found
5. ✅ POST - creates address successfully
6. ✅ POST - validates required fields (400 error)
7. ✅ PUT - updates address successfully
8. ✅ DELETE - soft deletes address
9. ✅ PATCH set-primary - marks address as primary
10. ✅ Authorization - user can't access other clients' addresses (403)

**Phone Numbers (8 tests)**:
1. ✅ GET list - returns client's phone numbers
2. ✅ GET single - returns phone by ID
3. ✅ GET single - 404 if not found
4. ✅ POST - creates phone successfully
5. ✅ POST - validates phone format (400 error)
6. ✅ PUT - updates phone successfully
7. ✅ DELETE - soft deletes phone
8. ✅ PATCH set-primary - marks phone as primary

**Rate Limiting (2 tests)**:
1. ✅ Returns 429 when limit exceeded
2. ✅ Includes retryAfter header

**Caching (2 tests)**:
1. ✅ Caches response on first request
2. ✅ Invalidates cache after mutation

**Total: 22 integration tests**

### Test Fixtures

**fixtures/clients.ts**:
```typescript
export const mockClient = {
  id: '123e4567-e89b-12d3-a456-426614174100',
  user_id: 'user-1',
  first_name: 'Juan',
  last_name: 'Dela Cruz',
  created_at: new Date().toISOString(),
  deleted_at: null,
};

export const mockOtherClient = {
  id: '123e4567-e89b-12d3-a456-426614174101',
  user_id: 'user-2',  // Different user
  first_name: 'Maria',
  last_name: 'Santos',
  created_at: new Date().toISOString(),
  deleted_at: null,
};
```

**fixtures/psgc.ts**:
```typescript
export const mockPSGC = {
  id: 1,
  code: '130000000',
  region: 'National Capital Region (NCR)',
  province: 'Metro Manila',
  city_municipality: 'Manila',
  barangay: 'Ermita',
};

export const mockPSGCList = [
  mockPSGC,
  {
    id: 2,
    code: '130010000',
    region: 'National Capital Region (NCR)',
    province: 'Metro Manila',
    city_municipality: 'Makati',
    barangay: 'Poblacion',
  },
];
```

**fixtures/addresses.ts**:
```typescript
export const mockAddress = {
  id: '123e4567-e89b-12d3-a456-426614174200',
  client_id: '123e4567-e89b-12d3-a456-426614174100',
  psgc_id: 1,
  label: 'Home',
  street_address: '123 Main St',
  postal_code: '1000',
  latitude: 14.5995,
  longitude: 120.9842,
  is_primary: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
};

export const mockAddressList = [
  mockAddress,
  {
    ...mockAddress,
    id: '123e4567-e89b-12d3-a456-426614174201',
    label: 'Work',
    is_primary: false,
  },
];

export const mockAddressWithPSGC = {
  ...mockAddress,
  psgc: mockPSGC,
};
```

**fixtures/phone-numbers.ts**:
```typescript
export const mockPhoneNumber = {
  id: '223e4567-e89b-12d3-a456-426614174200',
  client_id: '123e4567-e89b-12d3-a456-426614174100',
  label: 'Mobile',
  number: '09171234567',
  is_primary: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
};

export const mockPhoneNumberList = [
  mockPhoneNumber,
  {
    ...mockPhoneNumber,
    id: '223e4567-e89b-12d3-a456-426614174201',
    label: 'Home',
    is_primary: false,
  },
];
```

**fixtures/tokens.ts**:
```typescript
import { sign } from 'hono/jwt';

export interface MockToken {
  token: string;
  userId: string;
  role: string;
}

/**
 * Generate a mock JWT token for testing
 */
export function generateMockToken(overrides: Partial<MockToken> = {}): MockToken {
  const payload = {
    id: overrides.userId || 'user-1',
    role: overrides.role || 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  const token = sign(payload, process.env.JWT_SECRET || 'test-secret');

  return {
    token,
    userId: payload.id,
    role: payload.role,
  };
}

// Pre-generated tokens for common scenarios
export const mockAdminToken = generateMockToken({ role: 'admin' });
export const mockUserToken = generateMockToken({ role: 'caravan' });
export const mockOtherUserToken = generateMockToken({ userId: 'user-2', role: 'caravan' });
```

### Test Setup

**File**: `src/tests/integration/setup.ts`
```typescript
import { vi, beforeEach, afterEach } from 'vitest';
import { app } from '../../app';
import { mockPool } from './mocks/database';

// Mock the database pool
vi.mock('../../db/pool', () => ({
  pool: mockPool,
}));

// Mock Redis (if testing caching)
vi.mock('../../cache/redis_cache', () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    cached: vi.fn((key, fn, ttl) => fn()), // Pass through to function
  },
  CacheMetrics: {
    recordHit: vi.fn(),
    recordMiss: vi.fn(),
    recordError: vi.fn(),
    getStats: vi.fn(() => ({ hits: 0, misses: 0, errors: 0, hitRate: '0%' })),
  },
}));

// Export app for testing
export { app };
```

**File**: `src/tests/integration/mocks/database.ts`
```typescript
import { vi } from 'vitest';
import * as fixtures from '../fixtures';

let mockData = {
  clients: [fixtures.mockClient, fixtures.mockOtherClient],
  addresses: [...fixtures.mockAddressList],
  phoneNumbers: [...fixtures.mockPhoneNumberList],
  psgc: [...fixtures.mockPSGCList],
};

export const mockPool = {
  query: vi.fn().mockImplementation((query: string, values: any[]) => {
    // SELECT clients
    if (query.includes('FROM clients')) {
      const client = mockData.clients.find((c: any) => c.id === values[0]);
      return { rows: client ? [client] : [], rowCount: client ? 1 : 0 };
    }

    // SELECT addresses with PSGC JOIN
    if (query.includes('FROM addresses a LEFT JOIN psgc p')) {
      const clientId = values[0];
      const addresses = mockData.addresses.filter((a: any) =>
        a.client_id === clientId && a.deleted_at === null
      );
      // Attach PSGC data
      const addressesWithPSGC = addresses.map((a: any) => ({
        ...a,
        psgc: mockData.psgc.find((p: any) => p.id === a.psgc_id),
      }));
      return { rows: addressesWithPSGC, rowCount: addressesWithPSGC.length };
    }

    // SELECT single address
    if (query.includes('FROM addresses WHERE a.id =')) {
      const address = mockData.addresses.find((a: any) =>
        a.id === values[0] && a.deleted_at === null
      );
      return { rows: address ? [address] : [], rowCount: address ? 1 : 0 };
    }

    // INSERT address
    if (query.includes('INSERT INTO addresses')) {
      const newAddress = {
        id: `new-${Date.now()}`,
        client_id: values[0],
        psgc_id: values[1],
        label: values[2],
        street_address: values[3],
        postal_code: values[4],
        latitude: values[5],
        longitude: values[6],
        is_primary: values[7],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };
      mockData.addresses.push(newAddress);
      return { rows: [newAddress], rowCount: 1 };
    }

    // UPDATE address
    if (query.includes('UPDATE addresses SET')) {
      const addressId = values[values.length - 1];
      const index = mockData.addresses.findIndex((a: any) => a.id === addressId);
      if (index !== -1) {
        mockData.addresses[index] = {
          ...mockData.addresses[index],
          updated_at: new Date().toISOString(),
        };
        return { rows: [mockData.addresses[index]], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // DELETE (soft delete)
    if (query.includes('UPDATE addresses SET deleted_at')) {
      const addressId = values[1];
      const index = mockData.addresses.findIndex((a: any) => a.id === addressId);
      if (index !== -1) {
        mockData.addresses[index].deleted_at = new Date().toISOString();
        return { rowCount: 1 };
      }
      return { rowCount: 0 };
    }

    // Default fallback
    return { rows: [], rowCount: 0 };
  }),
};

// Reset mock data before each test
export function resetMockData() {
  mockData = {
    clients: [fixtures.mockClient, fixtures.mockOtherClient],
    addresses: [...fixtures.mockAddressList],
    phoneNumbers: [...fixtures.mockPhoneNumberList],
    psgc: [...fixtures.mockPSGCList],
  };
}
```

### Additional Test Cases

**Pagination Tests**:
```typescript
describe('Address Pagination', () => {
  it('returns pagination metadata', async () => {
    const response = await app.request(
      `/clients/${mockClient.id}/addresses?limit=10&offset=0`,
      {
        headers: { Authorization: `Bearer ${mockAdminToken.token}` },
      }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('pagination');
    expect(json.pagination).toMatchObject({
      limit: 10,
      offset: 0,
      total: expect.any(Number),
    });
  });

  it('respects limit parameter', async () => {
    const response = await app.request(
      `/clients/${mockClient.id}/addresses?limit=1`,
      {
        headers: { Authorization: `Bearer ${mockAdminToken.token}` },
      }
    );

    const json = await response.json();
    expect(json.data).toHaveLength(1);
  });
});
```

**Authorization Tests**:
```typescript
describe('Address Authorization', () => {
  it('returns 403 when user tries to access other clients addresses', async () => {
    // user-1 trying to access user-2's client
    const response = await app.request(
      `/clients/${mockOtherClient.id}/addresses`,
      {
        headers: { Authorization: `Bearer ${mockUserToken.token}` },
      }
    );

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('permission');
  });

  it('allows admin to access any client addresses', async () => {
    const response = await app.request(
      `/clients/${mockOtherClient.id}/addresses`,
      {
        headers: { Authorization: `Bearer ${mockAdminToken.token}` },
      }
    );

    expect(response.status).toBe(200);
  });
});
```

**Validation Error Tests**:
```typescript
describe('Address Validation', () => {
  it('returns 400 when required fields missing', async () => {
    const response = await app.request(
      `/clients/${mockClient.id}/addresses`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${mockAdminToken.token}` },
        body: JSON.stringify({ street_address: '123 Main St' }), // Missing psgc_id, label
      }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('required');
  });

  it('returns 400 for invalid phone number format', async () => {
    const response = await app.request(
      `/clients/${mockClient.id}/phone-numbers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${mockAdminToken.token}` },
        body: JSON.stringify({
          label: 'Mobile',
          number: '123', // Invalid format
        }),
      }
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('Invalid');
  });
});
```

**Rate Limiting Tests**:
```typescript
describe('Rate Limiting', () => {
  it('returns 429 when rate limit exceeded', async () => {
    // Make 101 requests (exceeds 100/min limit)
    const requests = Array.from({ length: 101 }, (_, i) =>
      app.request(`/clients/${mockClient.id}/addresses`, {
        headers: { Authorization: `Bearer ${mockAdminToken.token}` },
      })
    );

    const responses = await Promise.all(requests);
    const lastResponse = responses[responses.length - 1];

    expect(lastResponse.status).toBe(429);
    const json = await lastResponse.json();
    expect(json.error).toBe('Too many requests');
    expect(json.retryAfter).toBeGreaterThan(0);
  });
});
```

**Environment Variables**
```bash
# .env.test
TEST_DB=false                    # Use mocked database
JWT_SECRET=test-secret           # Test JWT secret
REDIS_HOST=localhost             # Redis (optional for tests)
CACHE_ENABLED=false              # Disable caching for integration tests
```

**Running Tests**:
```bash
# Run all integration tests
pnpm test integration

# Run specific test file
pnpm test addresses.integration

# Run with coverage
pnpm test:coverage

# Run with verbose output
pnpm test integration --reporter=verbose
```

### Trade-offs
| Pros | Cons |
|------|------|
| Fast execution (<1 second) | Doesn't catch database-specific issues |
| No external dependencies | Mocks may become outdated |
| Consistent results | Doesn't test actual SQL queries |
| Easy to debug | Need to keep mocks in sync with schema |

---

## Implementation Order

1. **Integration Tests** (Priority: High) - 2-3 hours
   - No external dependencies
   - Validates existing functionality
   - Fast to implement
   - Creates safety net for other changes

2. **Rate Limiting** (Priority: High) - 30 minutes
   - Single-line middleware application
   - Immediate security improvement
   - No infrastructure changes
   - Test after integration tests

3. **Redis Caching** (Priority: Medium) - 3-4 hours
   - Requires Redis server setup
   - Performance optimization
   - Graceful fallback available
   - Can be deployed independently

---

## Success Criteria

### Integration Tests
- [ ] 22 integration tests passing (10 addresses + 8 phones + 2 rate limit + 2 caching)
- [ ] Test fixtures complete (clients, addresses, phones, PSGC, tokens)
- [ ] Mock database setup working
- [ ] Tests run in <1 second
- [ ] Coverage report generated

### Rate Limiting
- [ ] Rate limiting applied to all 12 endpoints (6 addresses + 6 phones)
- [ ] Middleware ordered correctly (rate limit → auth → handler)
- [ ] 429 response includes retryAfter header
- [ ] Rate limit test passing

### Redis Caching
- [ ] Cache service implemented with ioredis
- [ ] All GET endpoints using cache
- [ ] Cache invalidation on POST/PUT/DELETE
- [ ] PSGC caching implemented
- [ ] Graceful fallback when Redis unavailable
- [ ] Cache metrics endpoint (admin only)
- [ ] Caching integration tests passing

### Documentation
- [ ] .env.example updated with Redis variables
- [ ] API_DOCUMENTATION.md updated with rate limit info
- [ ] CACHING_STRATEGY.md updated with implementation details
- [ ] Integration test README created

---

## Documentation Updates

### Files to Update

1. **.env.example**
   - Add `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
   - Add `CACHE_ENABLED`, `CACHE_TTL_ADDRESSES`, `CACHE_TTL_PHONES`, `CACHE_TTL_PSGC`

2. **API_DOCUMENTATION.md**
   - Add rate limiting section (100 req/min)
   - Document 429 response
   - Add `Retry-After` header documentation
   - Note which endpoints are rate-limited

3. **CACHING_STRATEGY.md**
   - Update with actual implementation code
   - Add cache metrics section
   - Add verification endpoint documentation
   - Update with PSGC caching implementation

4. **README.md** (create new file in `src/tests/integration/`)
   - How to run integration tests
   - Test structure explanation
   - How to add new tests
   - Mock data management

5. **INTEGRATION_TESTS.md** (new file)
   - Complete test coverage list
   - How to write integration tests
   - Mock database usage
   - Fixture data reference

---

## Open Questions

**None** - All design decisions approved and gaps filled.

---

## Appendix: Dependencies

### Required (Already Installed)
- `ioredis` - ✅ v5.x installed (package.json)
- `vitest` - ✅ Installed (test runner)
- `hono/jwt` - ✅ Installed (JWT signing for test tokens)
- Existing rate limit middleware - ✅ Already implemented

### Optional (For Development)
- Redis server - Local: Docker or Windows binary
- Redis GUI - RedisInsight, AnotherRedisDesktopManager

### Redis Setup (Local Development)

**Docker** (recommended):
```bash
docker run -d -p 6379:6379 --name imu-redis redis:alpine
```

**Windows**:
```bash
# Download Redis for Windows from GitHub releases
# Or use WSL with Ubuntu
wsl sudo apt install redis-server
wsl redis-server
```

**Verify Redis Running**:
```bash
redis-cli ping
# Should return: PONG
```

---

## Rollback Plan

If any implementation fails:

### Integration Tests
- **Rollback**: Delete test files
- **Impact**: None (tests are additive)

### Rate Limiting
- **Rollback**: Remove middleware lines from route files
- **Impact**: Minimal (reverts to previous behavior)

### Redis Caching
- **Rollback**: Remove cache imports, set `CACHE_ENABLED=false`
- **Impact**: None (graceful fallback to database)

---

**Design Status**: ✅ **APPROVED - ALL GAPS FILLED**
**Next Step**: Create implementation plan using writing-plans skill
**Estimated Implementation Time**: 6-7 hours total
