/**
 * Backend Test Setup
 *
 * Sets up environment variables and mocks for backend tests
 *
 * @file setup.ts
 */

import { vi } from 'vitest';

// ============================================
// STEP 1: Set required environment variables
// ============================================

// Set PowerSync public key to prevent module load errors
process.env.POWERSYNC_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBCgKCAQEArz2x3GvFulN6JjKFcqwNPEyJH7FGjKk3qNfE5pQXPj6GkMqTfN7X
LN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3w
VWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxP
fN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7X
LN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3w
VWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxP
fN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7XLN3wVWxPfN7X
LwIDAQAB
-----END PUBLIC KEY-----`;

// Set DATABASE_URL to prevent connection errors
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';

// Set JWT_SECRET for integration tests (must match tokens.ts)
process.env.JWT_SECRET = 'your-256-bit-secret-key-here-min-32-characters';

// ============================================
// STEP 2: Smart database pool mock
// ============================================

// Store test users for role lookups
const testUsers = new Map<string, { id: string; email: string; role: string }>();

// Helper to register test users
export function registerTestUser(user: { id: string; email: string; role: string }): void {
  testUsers.set(user.id, user);
}

// Helper to get test user by ID
function getTestUser(id: string): { id: string; email: string; role: string } | undefined {
  return testUsers.get(id);
}

// Smart query mock that handles different query patterns
const mockQuery = vi.fn((queryText: string, params?: any[]) => {
  const q = queryText.trim().toLowerCase();

  // Check if RBAC is installed (roles table exists)
  if (q.includes('information_schema.tables') && q.includes('roles')) {
    return Promise.resolve({ rows: [{ roles_exist: true }] });
  }

  // Get user role for fallback
  if (q.includes('select role from users') && q.includes('where id =')) {
    const userId = params?.[0];
    const user = getTestUser(userId);
    if (user) {
      return Promise.resolve({ rows: [{ role: user.role }] });
    }
    return Promise.resolve({ rows: [] });
  }

  // Get user permissions from RBAC view
  if (q.includes('user_permissions_view') && q.includes('where user_id')) {
    const userId = params?.[0];
    const user = getTestUser(userId);

    if (!user) {
      return Promise.resolve({ rows: [] });
    }

    // Return permissions based on role
    const permissions = generatePermissionsForRole(user.role, userId);
    return Promise.resolve({ rows: permissions });
  }

  // Default: return empty rows
  return Promise.resolve({ rows: [] });
});

// Generate permissions for a given role
function generatePermissionsForRole(role: string, userId: string): any[] {
  const basePermission = { role_slug: role, user_id: userId };

  switch (role) {
    case 'admin':
      return [
        // All permissions for admin
        { resource: 'clients', action: 'create', constraint_name: null, ...basePermission },
        { resource: 'clients', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'clients', action: 'update', constraint_name: null, ...basePermission },
        { resource: 'clients', action: 'delete', constraint_name: null, ...basePermission },
        { resource: 'users', action: 'create', constraint_name: null, ...basePermission },
        { resource: 'users', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'users', action: 'update', constraint_name: null, ...basePermission },
        { resource: 'users', action: 'delete', constraint_name: null, ...basePermission },
        { resource: 'touchpoints', action: 'create', constraint_name: 'visit', ...basePermission },
        { resource: 'touchpoints', action: 'create', constraint_name: 'call', ...basePermission },
        { resource: 'touchpoints', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'touchpoints', action: 'update', constraint_name: null, ...basePermission },
        { resource: 'touchpoints', action: 'delete', constraint_name: null, ...basePermission },
        { resource: 'system', action: 'configure', constraint_name: null, ...basePermission },
        { resource: 'any_resource', action: 'any_action', constraint_name: null, ...basePermission },
      ];

    case 'area_manager':
      return [
        { resource: 'clients', action: 'create', constraint_name: null, ...basePermission },
        { resource: 'clients', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'clients', action: 'update', constraint_name: null, ...basePermission },
        { resource: 'clients', action: 'delete', constraint_name: null, ...basePermission },
        { resource: 'touchpoints', action: 'create', constraint_name: 'visit', ...basePermission },
        { resource: 'touchpoints', action: 'create', constraint_name: 'call', ...basePermission },
        { resource: 'touchpoints', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'touchpoints', action: 'update', constraint_name: null, ...basePermission },
      ];

    case 'assistant_area_manager':
      return [
        { resource: 'clients', action: 'create', constraint_name: null, ...basePermission },
        { resource: 'clients', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'clients', action: 'update', constraint_name: null, ...basePermission },
        { resource: 'touchpoints', action: 'create', constraint_name: 'visit', ...basePermission },
        { resource: 'touchpoints', action: 'create', constraint_name: 'call', ...basePermission },
        { resource: 'touchpoints', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'touchpoints', action: 'update', constraint_name: null, ...basePermission },
      ];

    case 'caravan':
      return [
        { resource: 'clients', action: 'create', constraint_name: null, ...basePermission },
        { resource: 'clients', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'clients', action: 'update', constraint_name: 'own', ...basePermission },
        { resource: 'touchpoints', action: 'create', constraint_name: 'visit', ...basePermission },
        { resource: 'touchpoints', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'touchpoints', action: 'update', constraint_name: null, ...basePermission },
      ];

    case 'tele':
      return [
        { resource: 'clients', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'touchpoints', action: 'create', constraint_name: 'call', ...basePermission },
        { resource: 'touchpoints', action: 'read', constraint_name: null, ...basePermission },
        { resource: 'touchpoints', action: 'update', constraint_name: null, ...basePermission },
      ];

    default:
      return [];
  }
}

const mockPool = {
  query: mockQuery,
  connect: vi.fn(() => Promise.resolve({
    query: mockQuery,
    release: vi.fn(),
  })),
  on: vi.fn(),
};

vi.mock('../db/index.js', () => ({
  pool: mockPool,
  default: mockPool,
}));

console.log('✅ Backend test setup complete');
