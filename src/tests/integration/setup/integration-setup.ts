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

// Mock database
vi.mock('../../../db/index.js', () => ({
  pool: mockPool,
  default: mockPool,
}));

// Mock Redis and cache services
vi.mock('ioredis', () => {
  const createMockRedis = () => ({
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve('OK')),
    setex: vi.fn(() => Promise.resolve('OK')),
    del: vi.fn(() => Promise.resolve(1)),
    incr: vi.fn(() => Promise.resolve(1)),
    expire: vi.fn(() => Promise.resolve(1)),
    on: vi.fn(function() { return this; }),
    connect: vi.fn(() => Promise.resolve()),
    quit: vi.fn(() => Promise.resolve()),
    keys: vi.fn(() => Promise.resolve([])),
    mget: vi.fn(() => Promise.resolve([])),
    mset: vi.fn(() => Promise.resolve('OK')),
    flushdb: vi.fn(() => Promise.resolve('OK')),
    info: vi.fn(() => Promise.resolve('')),
    dbsize: vi.fn(() => Promise.resolve(0)),
  });

  return {
    default: vi.fn().mockImplementation(createMockRedis),
  };
});

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

  // Register routes
  app.route('/api/addresses', addressesRoutes);
  app.route('/api/phone-numbers', phoneNumbersRoutes);

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
