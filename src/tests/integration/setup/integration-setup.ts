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

// Mock Redis (will be replaced with real Redis service in later tasks)
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
