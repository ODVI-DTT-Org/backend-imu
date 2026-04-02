/**
 * Permission-Based Authorization Middleware (WITH BACKWARD COMPATIBILITY)
 *
 * This middleware provides fine-grained permission checking using the RBAC system
 * with automatic fallback to role-based checks if RBAC is not installed.
 *
 * @file permissions.ts
 * @module middleware/permissions
 */

import { Context, Next } from 'hono';
import { pool } from '../db/index.js';
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from '../errors/index.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: {
      sub: string;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      iat?: number;
      exp?: number;
    };
    userPermissions?: Permission[];
  }
}

export interface Permission {
  resource: string;
  action: string;
  constraint_name?: string;
  role_slug: string;
}

// ============================================
// RBAC INSTALLATION CHECK
// ============================================

let rbacInstalledCache: boolean | null = null;
let cacheExpiry: number = 0;
const RBAC_CACHE_TTL = 60000; // 1 minute

async function isRbacInstalled(): Promise<boolean> {
  const now = Date.now();
  if (rbacInstalledCache !== null && cacheExpiry > now) {
    return rbacInstalledCache;
  }

  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'roles'
      ) as roles_exist
    `);

    const installed = result.rows[0].roles_exist;
    rbacInstalledCache = installed;
    cacheExpiry = now + RBAC_CACHE_TTL;
    return installed;
  } catch {
    return false;
  }
}

function clearRbacCache(): void {
  rbacInstalledCache = null;
  cacheExpiry = 0;
}

// ============================================
// ROLE-BASED FALLBACK (for when RBAC not installed)
// ============================================

async function checkRolePermission(
  userRole: string,
  resource: string,
  action: string,
  constraint?: string
): Promise<boolean> {
  // Admin has all permissions
  if (userRole === 'admin') {
    return true;
  }

  // Area managers and assistants
  if (userRole === 'area_manager' || userRole === 'assistant_area_manager') {
    if (action === 'read') return true;
    if (action === 'delete' || resource === 'system') return false;
    return true;
  }

  // Caravan role
  if (userRole === 'caravan') {
    if (resource === 'clients' && ['create', 'read'].includes(action)) return true;
    if (resource === 'touchpoints' && action === 'create' && constraint === 'visit') return true;
    if (['touchpoints', 'itineraries'].includes(resource) && ['read', 'update'].includes(action)) return true;
    if (resource === 'targets' && action === 'read') return true;
    if (resource === 'attendance' && action === 'create') return true;
    return false;
  }

  // Tele role
  if (userRole === 'tele') {
    if (resource === 'clients' && action === 'read') return true;
    if (resource === 'touchpoints' && action === 'create' && constraint === 'call') return true;
    if (resource === 'touchpoints' && ['read', 'update'].includes(action)) return true;
    if (['itineraries', 'targets'].includes(resource) && action === 'read') return true;
    return false;
  }

  return false;
}

async function getUserRoleFallback(userId: string): Promise<string | null> {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (result.rows.length > 0) {
      return result.rows[0].role;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================
// PERMISSION CACHE (only used when RBAC installed)
// ============================================

const permissionCache = new Map<string, { permissions: Permission[]; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getUserPermissionsFromRbac(userId: string): Promise<Permission[] | null> {
  const cached = permissionCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.permissions;
  }

  try {
    const result = await pool.query(
      `SELECT
        resource,
        action,
        constraint_name,
        role_slug
      FROM user_permissions_view
      WHERE user_id = $1
      ORDER BY resource, action`,
      [userId]
    );

    const permissions: Permission[] = result.rows;

    permissionCache.set(userId, {
      permissions,
      expires: Date.now() + CACHE_TTL,
    });

    return permissions;
  } catch {
    return null;
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get user permissions (wrapper that handles both RBAC and fallback)
 */
export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const rbacInstalled = await isRbacInstalled();
  if (!rbacInstalled) {
    return [];
  }
  const permissions = await getUserPermissionsFromRbac(userId);
  return permissions || [];
}

/**
 * Check if user has a specific permission (with fallback to role-based)
 */
export async function hasPermission(
  userId: string,
  resource: string,
  action: string,
  constraint?: string
): Promise<boolean> {
  const rbacInstalled = await isRbacInstalled();

  if (!rbacInstalled) {
    const userRole = await getUserRoleFallback(userId);
    if (!userRole) return false;
    return checkRolePermission(userRole, resource, action, constraint);
  }

  const permissions = await getUserPermissionsFromRbac(userId);
  if (!permissions) return false;

  return permissions.some(
    (p) =>
      p.resource === resource &&
      p.action === action &&
      (constraint === undefined ||
        p.constraint_name === null ||
        p.constraint_name === constraint)
  );
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  requiredPermissions: Array<{ resource: string; action: string; constraint?: string }>
): Promise<boolean> {
  for (const required of requiredPermissions) {
    if (await hasPermission(userId, required.resource, required.action, required.constraint)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if user has all of the specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  requiredPermissions: Array<{ resource: string; action: string; constraint?: string }>
): Promise<boolean> {
  for (const required of requiredPermissions) {
    if (!(await hasPermission(userId, required.resource, required.action, required.constraint))) {
      return false;
    }
  }
  return true;
}

/**
 * Require permission middleware (with backward compatibility)
 */
export const requirePermission = (
  resource: string,
  action: string,
  constraint?: string
) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      throw new AuthenticationError('No token provided');
    }

    const hasPerms = await hasPermission(user.sub, resource, action, constraint);

    if (!hasPerms) {
      const error = new AuthorizationError('Insufficient permissions');
      error.addDetail('required', { resource, action, constraint });
      throw error;
    }

    // Attach user permissions if RBAC is installed
    const rbacInstalled = await isRbacInstalled();
    if (rbacInstalled) {
      const permissions = await getUserPermissionsFromRbac(user.sub);
      if (permissions) {
        c.set('userPermissions', permissions);
      }
    }

    await next();
  };
};

/**
 * Require any of the specified permissions
 */
export const requireAnyPermission = (
  requiredPermissions: Array<{ resource: string; action: string; constraint?: string }>
) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      throw new AuthenticationError('No token provided');
    }

    const hasPerms = await hasAnyPermission(user.sub, requiredPermissions);

    if (!hasPerms) {
      const error = new AuthorizationError('Insufficient permissions');
      error.addDetail('required', requiredPermissions);
      throw error;
    }

    await next();
  };
};

/**
 * Require all specified permissions
 */
export const requireAllPermissions = (
  requiredPermissions: Array<{ resource: string; action: string; constraint?: string }>
) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      throw new AuthenticationError('No token provided');
    }

    const hasPerms = await hasAllPermissions(user.sub, requiredPermissions);

    if (!hasPerms) {
      const error = new AuthorizationError('Insufficient permissions');
      error.addDetail('required', requiredPermissions);
      throw error;
    }

    await next();
  };
};

/**
 * Ownership check middleware (handles both user_id and caravan_id)
 */
export const checkOwnership = (table: string, userIdColumnOrArray?: string | string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    const resourceId = c.req.param('id');

    if (!user) {
      throw new AuthenticationError('Unauthorized');
    }

    if (!resourceId) {
      throw new ValidationError('Resource ID required');
    }

    // Admin and area managers can access any resource
    if (['admin', 'area_manager'].includes(user.role)) {
      await next();
      return;
    }

    // Try both column names (user_id and caravan_id)
    const columnsToTry = Array.isArray(userIdColumnOrArray)
      ? userIdColumnOrArray
      : ['user_id', 'caravan_id'];

    let resourceOwnerId: string | null = null;

    for (const col of columnsToTry) {
      try {
        const result = await pool.query(
          `SELECT ${col} FROM ${table} WHERE id = $1`,
          [resourceId]
        );

        if (result.rows.length > 0 && result.rows[0][col] !== null) {
          resourceOwnerId = result.rows[0][col];
          break;
        }
      } catch {
        // Column doesn't exist, try next one
        continue;
      }
    }

    if (resourceOwnerId === null) {
      throw new NotFoundError('Resource');
    }

    // Check ownership
    if (resourceOwnerId !== user.sub) {
      throw new AuthorizationError('You do not own this resource');
    }

    await next();
  };
};

/**
 * Clear permission cache for a specific user
 */
export function clearPermissionCache(userId: string): void {
  permissionCache.delete(userId);
}

/**
 * Clear entire permission cache
 */
export function clearAllPermissionCache(): void {
  permissionCache.clear();
  clearRbacCache();
}

/**
 * Permission helper for Hono context
 */
export function permissionHelper(c: Context) {
  const user = c.get('user');

  return {
    can: async (resource: string, action: string, constraint?: string) => {
      if (!user) return false;
      return hasPermission(user.sub, resource, action, constraint);
    },

    canAny: async (requiredPermissions: Array<{ resource: string; action: string; constraint?: string }>) => {
      if (!user) return false;
      return hasAnyPermission(user.sub, requiredPermissions);
    },

    permissions: async () => {
      if (!user) return [];
      return getUserPermissions(user.sub);
    },

    hasRole: async (role: string) => {
      if (!user) return false;
      const rbacInstalled = await isRbacInstalled();
      if (!rbacInstalled) {
        return user.role === role;
      }
      const permissions = await getUserPermissionsFromRbac(user.sub);
      return permissions?.some((p) => p.role_slug === role) || false;
    },
  };
}

/**
 * Touchpoint type validation middleware (with permission-based checks)
 */
export const validateTouchpointType = () => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      throw new AuthenticationError('Unauthorized');
    }

    // Admin and managers can create any touchpoint type
    if (['admin', 'area_manager', 'assistant_area_manager'].includes(user.role)) {
      await next();
      return;
    }

    const body = await c.req.json().catch(() => ({}));
    const touchpointNumber = body.touchpoint_number;
    const touchpointType = body.type;

    if (!touchpointNumber || !touchpointType) {
      throw new ValidationError('touchpoint_number and type are required');
    }

    const visitNumbers = [1, 4, 7];
    const callNumbers = [2, 3, 5, 6];

    // Check permissions instead of just role name
    const canCreateVisit = await hasPermission(user.sub, 'touchpoints', 'create', 'visit');
    const canCreateCall = await hasPermission(user.sub, 'touchpoints', 'create', 'call');

    if (touchpointType === 'Visit') {
      if (!canCreateVisit) {
        const error = new AuthorizationError('You do not have permission to create Visit touchpoints');
        error.addDetail('allowed_numbers', visitNumbers);
        throw error;
      }
      if (!visitNumbers.includes(touchpointNumber)) {
        const error = new ValidationError(`Invalid touchpoint number ${touchpointNumber} for Visit type`);
        error.addDetail('allowed_numbers', visitNumbers);
        throw error;
      }
    } else if (touchpointType === 'Call') {
      if (!canCreateCall) {
        const error = new AuthorizationError('You do not have permission to create Call touchpoints');
        error.addDetail('allowed_numbers', callNumbers);
        throw error;
      }
      if (!callNumbers.includes(touchpointNumber)) {
        const error = new ValidationError(`Invalid touchpoint number ${touchpointNumber} for Call type`);
        error.addDetail('allowed_numbers', callNumbers);
        throw error;
      }
    } else {
      throw new ValidationError('Invalid touchpoint type. Must be Visit or Call');
    }

    await next();
  };
};

// Export utility functions
export { isRbacInstalled, clearRbacCache };
