/**
 * Test Helper Functions for RBAC Integration Tests
 *
 * @file test-helpers.ts
 */

import jwt from 'jsonwebtoken';
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

// Test JWT configuration (using HS256 for tests)
const TEST_JWT_SECRET = 'test-secret-key-for-integration-tests';

export interface TestUser {
  id: string;
  sub: string; // Required for JwtPayload compatibility
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  role_slug?: string;
}

export interface TestTokens {
  admin: string;
  areaManager: string;
  assistantAreaManager: string;
  caravan: string;
  tele: string;
}

/**
 * Generate a test JWT token for a user
 */
export function generateTestToken(user: TestUser): string {
  const payload = {
    sub: user.id, // JWT standard subject claim
    id: user.id, // Include id for compatibility
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    role_slug: user.role_slug || user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
  };

  return jwt.sign(payload, TEST_JWT_SECRET, { algorithm: 'HS256' });
}

/**
 * Generate test tokens for all user roles
 */
export function generateTestTokens(users: Record<string, TestUser>): TestTokens {
  return {
    admin: generateTestToken(users.admin),
    areaManager: generateTestToken(users.areaManager),
    assistantAreaManager: generateTestToken(users.assistantAreaManager),
    caravan: generateTestToken(users.caravan),
    tele: generateTestToken(users.tele),
  };
}

/**
 * Create a test Hono app with protected routes
 */
export function createTestApp(): Hono {
  const app = new Hono();

  // Test route that requires 'clients' read permission
  app.get(
    '/api/test/clients',
    (c, next) => {
      // Mock auth middleware for testing
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const decoded = jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] }) as TestUser & { iat?: number; exp?: number };
          c.set('user', decoded);
        } catch {
          return c.json({ message: 'Invalid token' }, 401);
        }
      } else {
        return c.json({ message: 'No token provided' }, 401);
      }
      return next();
    },
    requirePermission('clients', 'read'),
    (c) => c.json({ success: true, message: 'Clients access granted' })
  );

  // Test route that requires 'clients' create permission
  app.post(
    '/api/test/clients',
    (c, next) => {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const decoded = jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] }) as TestUser & { iat?: number; exp?: number };
          c.set('user', decoded);
        } catch {
          return c.json({ message: 'Invalid token' }, 401);
        }
      } else {
        return c.json({ message: 'No token provided' }, 401);
      }
      return next();
    },
    requirePermission('clients', 'create'),
    (c) => c.json({ success: true, message: 'Client created' })
  );

  // Test route that requires 'clients' delete permission
  app.delete(
    '/api/test/clients/:id',
    (c, next) => {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const decoded = jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] }) as TestUser & { iat?: number; exp?: number };
          c.set('user', decoded);
        } catch {
          return c.json({ message: 'Invalid token' }, 401);
        }
      } else {
        return c.json({ message: 'No token provided' }, 401);
      }
      return next();
    },
    requirePermission('clients', 'delete'),
    (c) => c.json({ success: true, message: 'Client deleted' })
  );

  // Test route for touchpoint creation with visit permission
  app.post(
    '/api/test/touchpoints/visit',
    (c, next) => {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const decoded = jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] }) as TestUser & { iat?: number; exp?: number };
          c.set('user', decoded);
        } catch {
          return c.json({ message: 'Invalid token' }, 401);
        }
      } else {
        return c.json({ message: 'No token provided' }, 401);
      }
      return next();
    },
    requirePermission('touchpoints', 'create', 'visit'),
    (c) => c.json({ success: true, message: 'Visit touchpoint created' })
  );

  // Test route for touchpoint creation with call permission
  app.post(
    '/api/test/touchpoints/call',
    (c, next) => {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const decoded = jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] }) as TestUser & { iat?: number; exp?: number };
          c.set('user', decoded);
        } catch {
          return c.json({ message: 'Invalid token' }, 401);
        }
      } else {
        return c.json({ message: 'No token provided' }, 401);
      }
      return next();
    },
    requirePermission('touchpoints', 'create', 'call'),
    (c) => c.json({ success: true, message: 'Call touchpoint created' })
  );

  return app;
}

/**
 * Make an authenticated request to the test app
 */
export async function makeAuthenticatedRequest(
  app: Hono,
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `http://localhost${path}`;
  return app.request(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Parse JSON response
 */
export async function parseJsonResponse<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}
