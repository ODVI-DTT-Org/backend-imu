// src/tests/integration/setup/integration-setup.ts

/**
 * Integration Test Setup
 *
 * Sets up Hono app with mocked database for integration testing
 *
 * @file integration-setup.ts
 */

import { vi, beforeEach, afterEach } from 'vitest';
import { mockPool } from './mock-db.js';
import { Hono } from 'hono';
import addressesRoutes from '../../../routes/addresses.js';
import phoneNumbersRoutes from '../../../routes/phone-numbers.js';
import { authMiddleware } from '../../../middleware/auth.js';
import type { AppError } from '../../../errors/index.js';

// Mock database
vi.mock('../../../db/index.js', () => ({
  pool: mockPool,
  default: mockPool,
}));

// Mock Redis and cache services
vi.mock('ioredis', () => {
  // Track counters per key for rate limiting
  const counters = new Map<string, number>();

  const createMockRedis = () => ({
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve('OK')),
    setex: vi.fn(() => Promise.resolve('OK')),
    del: vi.fn(() => Promise.resolve(1)),
    incr: vi.fn((key: string) => {
      const current = counters.get(key) || 0;
      counters.set(key, current + 1);
      return Promise.resolve(current + 1);
    }),
    expire: vi.fn(() => Promise.resolve(1)),
    on: vi.fn(function() { return this; }),
    connect: vi.fn(() => Promise.resolve()),
    quit: vi.fn(() => Promise.resolve()),
    keys: vi.fn(() => Promise.resolve([])),
    mget: vi.fn(() => Promise.resolve([])),
    mset: vi.fn(() => Promise.resolve('OK')),
    flushdb: vi.fn(() => {
      counters.clear();
      return Promise.resolve('OK');
    }),
    info: vi.fn(() => Promise.resolve('')),
    dbsize: vi.fn(() => Promise.resolve(counters.size)),
  });

  return {
    default: vi.fn().mockImplementation(createMockRedis),
  };
});

// Mock error logger service
vi.mock('../../../services/errorLogger.js', () => ({
  errorLogger: {
    log: vi.fn(() => Promise.resolve()),
  },
}));

// Mock cache services to return mock implementations
vi.mock('../../../services/cache/redis-cache.js', () => ({
  getCacheService: vi.fn(() => ({
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve(true)),
    del: vi.fn(() => Promise.resolve(true)),
    delPattern: vi.fn(() => Promise.resolve(0)),
    exists: vi.fn(() => Promise.resolve(false)),
    incr: vi.fn(() => Promise.resolve(0)),
    mget: vi.fn(() => Promise.resolve([])),
    mset: vi.fn(() => Promise.resolve(true)),
    flush: vi.fn(() => Promise.resolve(true)),
    getStats: vi.fn(() => Promise.resolve({
      keyCount: 0,
      memoryUsage: '0B',
      hitRate: 0,
    })),
    getClient: vi.fn(),
    isEnabled: vi.fn(() => false),
  })),
  CACHE_TTL: {
    SHORT: 300,
    MEDIUM: 1800,
    LONG: 3600,
    DAY: 86400,
  },
  CACHE_PREFIX: {
    ADDRESSES: 'addr:',
    PHONE_NUMBERS: 'phone:',
    PSGC: 'psgc:',
    CLIENT: 'client:',
  },
}));

vi.mock('../../../services/cache/cache-metrics.js', () => ({
  getCacheMetrics: vi.fn(() => ({
    recordHit: vi.fn(),
    recordMiss: vi.fn(),
    recordSet: vi.fn(),
    recordDelete: vi.fn(),
    recordError: vi.fn(),
    getStats: vi.fn(() => ({
      hits: 0,
      misses: 0,
      hitRate: 0,
      missRate: 0,
      totalRequests: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    })),
    getSummary: vi.fn(() => ({
      hits: 0,
      misses: 0,
      hitRate: 0,
      missRate: 0,
      totalRequests: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    })),
    reset: vi.fn(),
  })),
}));

// Create test app
export function createTestApp(): Hono {
  const app = new Hono();

  // Apply auth middleware (use optional auth for testing)
  app.use('/api/*', authMiddleware);

  // Register routes (mount at /api so routes become /api/clients/:id/addresses)
  app.route('/api', addressesRoutes);
  app.route('/api', phoneNumbersRoutes);

  // Error handler for tests (handles all errors) - must be AFTER routes
  app.onError((error: any, c) => {
    // Check if error has statusCode (AppError)
    const statusCode = error.statusCode || 500;
    const code = error.code || 'INTERNAL_SERVER_ERROR';

    return c.json({
      success: false,
      message: error.message || 'Internal server error',
      code,
    }, statusCode);
  });

  return app;
}

// Setup and teardown helpers
export function setupIntegrationTest(): void {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Reset test data after each test
    const { resetTestData } = vi.mocked(await import('./mock-db.js'));
    resetTestData();
  });
}

// Helper to set authenticated user in context
export function setAuthenticatedUser(
  app: Hono,
  user: {
    sub: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
  }
): void {
  // This is handled via Authorization header in actual requests
  // The auth middleware will decode the JWT and set the user
}

// Export test utilities
export const testUtils = {
  createTestApp,
  setupIntegrationTest,
  setAuthenticatedUser,
};
