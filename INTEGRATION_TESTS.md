# Integration Tests Guide

This guide covers running and writing integration tests for the backend API.

---

## Overview

Integration tests verify that API endpoints work correctly with mocked dependencies (database, Redis, etc.). They provide faster execution than end-to-end tests while validating the complete request/response flow.

**Test Stack:**
- **Framework:** Vitest
- **HTTP:** Hono built-in test utilities
- **Database:** Mocked (no real database required)
- **Redis:** Mocked (no real Redis required)
- **Auth:** JWT tokens from fixtures

---

## Running Tests

### Run All Integration Tests

```bash
# From backend-feature-addresses directory
pnpm test src/tests/integration
```

### Run Specific Test File

```bash
# Addresses tests
pnpm test src/tests/integration/addresses.get.test.ts

# Phone numbers tests
pnpm test src/tests/integration/phone-numbers.test.ts

# Rate limiting tests
pnpm test src/tests/integration/rate-limit.test.ts
```

### Run with Coverage

```bash
pnpm test:coverage src/tests/integration
```

### Watch Mode

```bash
pnpm test:watch src/tests/integration
```

---

## Test Structure

### Directory Layout

```
src/tests/integration/
├── fixtures/
│   ├── clients.ts          # Mock client data
│   ├── psgc.ts             # Mock PSGC data
│   ├── addresses.ts        # Mock address data
│   ├── phone-numbers.ts    # Mock phone number data
│   └── tokens.ts           # JWT token generators
├── setup/
│   ├── mock-db.ts          # Mock database pool
│   └── integration-setup.ts # Test app setup
├── addresses.get.test.ts   # Address GET tests
├── addresses.post.test.ts  # Address POST/PUT tests
├── addresses.delete.test.ts # Address DELETE/auth tests
├── phone-numbers.test.ts   # Phone numbers tests
└── rate-limit.test.ts      # Rate limiting tests
```

---

## Writing Integration Tests

### Test Template

```typescript
// src/tests/integration/example.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp } from './setup/integration-setup.js';
import { testTokens } from './fixtures/tokens.js';

describe('Example Integration Tests', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /api/example', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.request('/api/example', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    it('should return data with authentication', async () => {
      const response = await app.request('/api/example', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${testTokens.admin}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toHaveProperty('success');
    });
  });
});
```

---

## Using Fixtures

### Available Fixtures

**Clients:**
```typescript
import { mockClient, mockOtherClient } from './fixtures/clients.js';

// mockClient.id - UUID for test client
// mockClient.user_id - 'user-1'
// mockClient.first_name - 'Juan'
// mockClient.last_name - 'Dela Cruz'
```

**PSGC:**
```typescript
import { mockPSGC, mockPSGCList } from './fixtures/psgc.js';

// mockPSGC.id - 1
// mockPSGC.code - '130000000'
// mockPSGC.region - 'National Capital Region (NCR)'
// mockPSGC.province - 'Metro Manila'
// mockPSGC.city_municipality - 'Manila'
// mockPSGC.barangay - 'Ermita'
```

**Addresses:**
```typescript
import { mockAddress, mockAddressList } from './fixtures/addresses.js';

// mockAddress.id - UUID
// mockAddress.client_id - Links to mockClient
// mockAddress.label - 'Home'
// mockAddress.street_address - '123 Main St'
// mockAddress.is_primary - true
```

**Phone Numbers:**
```typescript
import { mockPhoneNumber, mockPhoneNumberList } from './fixtures/phone-numbers.js';

// mockPhoneNumber.id - UUID
// mockPhoneNumber.client_id - Links to mockClient
// mockPhoneNumber.label - 'Mobile'
// mockPhoneNumber.number - '09171234567'
// mockPhoneNumber.is_primary - true
```

**Tokens:**
```typescript
import { testTokens } from './fixtures/tokens.js';

// testTokens.admin - Admin user token
// testTokens.caravan - Field agent token
// testTokens.tele - Telemarketer token
// testTokens.clientOwner - Token for mockClient's owner
// testTokens.otherUser - Token for different user
// testTokens.expired - Expired token for testing
```

---

## Authentication Testing

### Test Without Authentication

```typescript
it('should return 401 without token', async () => {
  const response = await app.request('/api/addresses/123', {
    method: 'GET',
  });

  expect(response.status).toBe(401);
});
```

### Test With Authentication

```typescript
it('should return data with valid token', async () => {
  const response = await app.request('/api/addresses/123', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${testTokens.clientOwner}`,
    },
  });

  expect(response.status).toBe(200);
});
```

### Test Authorization (Role-Based)

```typescript
it('should deny access to other client\'s data', async () => {
  const response = await app.request(`/api/addresses/${mockOtherClient.id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${testTokens.clientOwner}`, // Different user
    },
  });

  expect(response.status).toBe(403);
});
```

---

## Testing CRUD Operations

### Create (POST)

```typescript
it('should create new resource', async () => {
  const newResource = {
    name: 'Test Resource',
    value: 123,
  };

  const response = await app.request('/api/resources', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testTokens.admin}`,
    },
    body: JSON.stringify(newResource),
  });

  expect(response.status).toBe(201);
  const json = await response.json();
  expect(json.data).toHaveProperty('id');
  expect(json.data.name).toBe(newResource.name);
});
```

### Read (GET)

```typescript
it('should return resource list', async () => {
  const response = await app.request(`/api/clients/${mockClient.id}/addresses`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${testTokens.clientOwner}`,
    },
  });

  expect(response.status).toBe(200);
  const json = await response.json();
  expect(Array.isArray(json.data)).toBe(true);
  expect(json.data.length).toBeGreaterThan(0);
});
```

### Update (PUT)

```typescript
it('should update resource', async () => {
  const updates = { label: 'Updated Label' };

  const response = await app.request(`/api/addresses/${addressId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testTokens.clientOwner}`,
    },
    body: JSON.stringify(updates),
  });

  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.data.label).toBe(updates.label);
});
```

### Delete (DELETE)

```typescript
it('should delete resource', async () => {
  const response = await app.request(`/api/addresses/${addressId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${testTokens.clientOwner}`,
    },
  });

  expect(response.status).toBe(200);

  // Verify it's deleted
  const getResponse = await app.request(`/api/addresses/${addressId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${testTokens.clientOwner}`,
    },
  });

  expect(getResponse.status).toBe(404);
});
```

---

## Testing Rate Limiting

```typescript
it('should enforce rate limit', async () => {
  // Make multiple requests
  const requests = Array.from({ length: 105 }, () =>
    app.request('/api/addresses/123', {
      method: 'GET',
      headers: { Authorization: `Bearer ${testTokens.admin}` },
    })
  );

  const responses = await Promise.all(requests);

  // Some should be rate limited
  const rateLimited = responses.filter(r => r.status === 429);
  expect(rateLimited.length).toBeGreaterThan(0);

  // Check rate limit headers
  const firstResponse = responses[0];
  expect(firstResponse.headers.get('X-RateLimit-Limit')).toBeTruthy();
  expect(firstResponse.headers.get('X-RateLimit-Remaining')).toBeTruthy();
});
```

---

## Testing Cache Behavior

```typescript
it('should cache GET requests', async () => {
  // First request - cache miss
  const response1 = await app.request(`/api/clients/${mockClient.id}/addresses`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${testTokens.clientOwner}` },
  });

  expect(response1.status).toBe(200);

  // Second request - cache hit (faster)
  const response2 = await app.request(`/api/clients/${mockClient.id}/addresses`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${testTokens.clientOwner}` },
  });

  expect(response2.status).toBe(200);
});

it('should invalidate cache on update', async () => {
  // Create cache
  await app.request(`/api/clients/${mockClient.id}/addresses`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${testTokens.clientOwner}` },
  });

  // Update (should invalidate cache)
  await app.request(`/api/addresses/${addressId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testTokens.clientOwner}`,
    },
    body: JSON.stringify({ label: 'Updated' }),
  });

  // Next GET should fetch fresh data
  const response = await app.request(`/api/clients/${mockClient.id}/addresses`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${testTokens.clientOwner}` },
  });

  expect(response.status).toBe(200);
});
```

---

## Error Testing

### Test Validation Errors

```typescript
it('should return 400 for invalid data', async () => {
  const invalidData = {
    label: 'Invalid Label', // Not in enum
    number: 'not-a-phone', // Invalid format
  };

  const response = await app.request('/api/phone-numbers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testTokens.clientOwner}`,
    },
    body: JSON.stringify(invalidData),
  });

  expect(response.status).toBe(400);
  const json = await response.json();
  expect(json.message).toContain('validation');
});
```

### Test Not Found Errors

```typescript
it('should return 404 for non-existent resource', async () => {
  const response = await app.request('/api/addresses/00000000-0000-0000-0000-000000000000', {
    method: 'GET',
    headers: { Authorization: `Bearer ${testTokens.clientOwner}` },
  });

  expect(response.status).toBe(404);
  const json = await response.json();
  expect(json.message).toContain('not found');
});
```

---

## Pagination Testing

```typescript
it('should paginate results correctly', async () => {
  // First page
  const page1 = await app.request(`/api/clients/${mockClient.id}/addresses?page=1&limit=2`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${testTokens.clientOwner}` },
  });

  const json1 = await page1.json();
  expect(json1.data.length).toBe(2);
  expect(json1.pagination.page).toBe(1);
  expect(json1.pagination.hasNext).toBe(true);

  // Second page
  const page2 = await app.request(`/api/clients/${mockClient.id}/addresses?page=2&limit=2`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${testTokens.clientOwner}` },
  });

  const json2 = await page2.json();
  expect(json2.pagination.page).toBe(2);
});
```

---

## Best Practices

### 1. Use Descriptive Test Names

```typescript
// Good
it('should return 403 when user tries to access another client\'s addresses', async () => {});

// Bad
it('should fail', async () => {});
```

### 2. Test One Thing Per Test

```typescript
// Good
it('should validate required fields', async () => {});
it('should validate phone number format', async () => {});

// Bad
it('should validate everything', async () => {});
```

### 3. Use beforeEach for Setup

```typescript
beforeEach(() => {
  app = createTestApp();
  // Reset test data
  resetTestData();
});
```

### 4. Assert Meaningful Properties

```typescript
// Good
expect(json.data.id).toBeTruthy();
expect(json.data.client_id).toBe(mockClient.id);
expect(json.data).toHaveProperty('created_at');

// Bad
expect(json).toBeTruthy();
```

### 5. Test Edge Cases

```typescript
it('should handle empty results', async () => {});
it('should handle very long strings', async () => {});
it('should handle special characters', async () => {});
it('should handle concurrent requests', async () => {});
```

---

## Troubleshooting

### Tests Fail with "Cannot find module"

**Problem:** Import paths are incorrect.

**Solution:** Use `.js` extensions in imports (TypeScript compiles to JS):
```typescript
import { createTestApp } from './setup/integration-setup.js'; // Correct
import { createTestApp } from './setup/integration-setup'; // Wrong
```

### Tests Fail with "Redis connection refused"

**Problem:** Tests trying to connect to real Redis.

**Solution:** Redis is mocked in tests. Verify mock is applied:
```typescript
vi.mock('ioredis', () => ({
  default: vi.fn(() => ({ /* mock methods */ })),
}));
```

### Tests Pass But Should Fail

**Problem:** Test not actually testing the code path.

**Solution:** Add assertions to verify behavior:
```typescript
it('should create address', async () => {
  const response = await app.request('/api/addresses', {
    method: 'POST',
    // ...
  });

  // Add this!
  expect(response.status).toBe(201);
});
```

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install

      - name: Run integration tests
        run: pnpm test src/tests/integration

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

**Last Updated:** 2026-04-08
**Status:** ✅ Integration tests implemented
**Test Count:** 40+ integration tests
