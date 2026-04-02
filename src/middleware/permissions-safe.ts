/**
 * Permission-Based Authorization Middleware (WITH BACKWARD COMPATIBILITY)
 *
 * This middleware provides fine-grained permission checking using the RBAC system
 * with automatic fallback to role-based checks if RBAC is not installed.
 *
 * @file permissions-safe.ts
 * @module middleware/permissions-safe
 */

import { Context, Next } from 'hono';
import { pool } from '../db/index.js';
import {
  isRbacInstalled,
  checkRolePermission,
  getUserRole,
  getUserIdColumn,
  checkResourceOwnership,
  canCreateTouchpointType,
  clearRbacCache,
} from './rbac-utils.js';
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
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

// Permission cache (only used when RBAC is installed)
const permissionCache = new Map<string, { permissions: Permission[]; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get user permissions from database or cache (RBAC only)
 */
async function getUserPermissionsFromRbac(userId: string): Promise<Permission[]> {
  // Check cache first
  const cached = permissionCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.permissions;
  }

  // Fetch from database
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

  // Cache the result
  permissionCache.set(userId, {
    permissions,
    expires: Date.now() + CACHE_TTL,
  });

  return permissions;
}

/**
 * Check if user has a specific permission (with fallback)
 */
export async function hasPermission(
  userId: string,
  resource: string,
  action: string,
  constraint?: string
): Promise<boolean> {
  // Check if RBAC is installed
  const rbacInstalled = await isRbacInstalled();

  if (!rbacInstalled) {
    // Fallback to role-based check
    const userRole = await getUserRole(userId);
    if (!userRole) {
      return false;
    }
    return checkRolePermission(userRole, resource, action, constraint);
  }

  // Use RBAC permission check
  const permissions = await getUserPermissionsFromRbac(userId);

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

    // Check permission (with automatic fallback)
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
      c.set('userPermissions', permissions);
    }

    await next();
  };
};

/**
 * Require any of the specified permissions (with fallback)
 */
export const requireAnyPermission = (
  requiredPermissions: Array<{ resource: string; action: string; constraint?: string }>
) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      throw new AuthenticationError('No token provided');
    }

    const rbacInstalled = await isRbacInstalled();

    for (const required of requiredPermissions) {
      const hasPerms = await hasPermission(
        user.sub,
        required.resource,
        required.action,
        required.constraint
      );
      if (hasPerms) {
        // Found a valid permission
        if (rbacInstalled) {
          const permissions = await getUserPermissionsFromRbac(user.sub);
          c.set('userPermissions', permissions);
        }
        await next();
        return;
      }
    }

    const error = new AuthorizationError('Insufficient permissions');
    error.addDetail('required', requiredPermissions);
    throw error;
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
    const userRole = await getUserRole(user.sub);
    if (userRole && ['admin', 'area_manager'].includes(userRole)) {
      await next();
      return;
    }

    // Check ownership (handles both column names automatically)
    const ownsResource = await checkResourceOwnership(table, resourceId, user.sub);

    if (!ownsResource) {
      throw new AuthorizationError('You do not own this resource');
    }

    await next();
  };
};

/**
 * Touchpoint type validation middleware (with fallback)
 */
export const validateTouchpointType = () => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      throw new AuthenticationError('Unauthorized');
    }

    const body = await c.req.json().catch(() => ({}));
    const touchpointNumber = body.touchpoint_number;
    const touchpointType = body.type;

    if (!touchpointNumber || !touchpointType) {
      throw new ValidationError('touchpoint_number and type are required');
    }

    // Validate using the utility function (with RBAC fallback)
    const result = await canCreateTouchpointType(user.sub, touchpointNumber, touchpointType);

    if (!result.allowed) {
      throw new AuthorizationError(result.reason || 'Touchpoint validation failed');
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
 * Clear all permission caches
 */
export function clearAllPermissionCaches(): void {
  permissionCache.clear();
  clearRbacCache();
}

/**
 * Permission helper for Hono context
 */
export function permissionHelper(c: Context) {
  const user = c.get('user');

  return {
    /**
     * Check if current user has a specific permission
     */
    can: async (resource: string, action: string, constraint?: string) => {
      if (!user) return false;
      return hasPermission(user.sub, resource, action, constraint);
    },

    /**
     * Get all permissions for current user (if RBAC installed)
     */
    permissions: async () => {
      if (!user) return [];
      const rbacInstalled = await isRbacInstalled();
      if (!rbacInstalled) {
        // Return role-based permissions
        const userRole = user.role;
        return [
          {
            resource: 'all',
            action: 'all',
            constraint_name: null,
            role_slug: userRole,
          },
        ];
      }
      return getUserPermissionsFromRbac(user.sub);
    },

    /**
     * Check if current user has a specific role
     */
    hasRole: async (role: string) => {
      if (!user) return false;
      const userRole = await getUserRole(user.sub);
      return userRole === role;
    },
  };
}

/**
 * Export all permission-checking functions
 */
export {
  isRbacInstalled,
  checkRolePermission,
  getUserRole,
  getUserIdColumn,
  checkResourceOwnership,
  canCreateTouchpointType,
} from './rbac-utils.js';
