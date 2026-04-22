/**
 * RBAC Utilities and Backward Compatibility
 *
 * This module provides utilities to check RBAC installation status
 * and maintain backward compatibility with the old role-based system.
 *
 * @file rbac-utils.ts
 * @module middleware/rbac-utils
 */

import { pool } from '../db/index.js';

// Cache for RBAC installation status
let rbacInstalledCache: boolean | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Check if the RBAC system (migration 033) is installed
 */
export async function isRbacInstalled(): Promise<boolean> {
  const now = Date.now();

  // Return cached value if still valid
  if (rbacInstalledCache !== null && cacheExpiry > now) {
    return rbacInstalledCache;
  }

  try {
    // Check if key RBAC components exist
    const result = await pool.query(`
      SELECT
        (SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'roles'
        )) as roles_exist,
        (SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'permissions'
        )) as permissions_exist,
        (SELECT EXISTS (
          SELECT 1 FROM information_schema.views
          WHERE view_name = 'user_permissions_view'
        )) as view_exist
    `);

    const { roles_exist, permissions_exist, view_exist } = result.rows[0];

    const installed = roles_exist && permissions_exist && view_exist;

    // Cache the result
    rbacInstalledCache = installed;
    cacheExpiry = now + CACHE_TTL;

    return installed;
  } catch (error) {
    console.error('Error checking RBAC installation:', error);
    return false;
  }
}

/**
 * Clear the RBAC installation cache
 * Call this after running migration 033
 */
export function clearRbacCache(): void {
  rbacInstalledCache = null;
  cacheExpiry = 0;
}

/**
 * Fallback role-based permission check
 * Used when RBAC is not installed
 */
export async function checkRolePermission(
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
    // Can read most resources
    if (action === 'read') {
      return true;
    }
    // Can't delete or configure system
    if (action === 'delete' || resource === 'system') {
      return false;
    }
    return true;
  }

  // Caravan role
  if (userRole === 'caravan') {
    // Can create and read clients
    if (resource === 'clients' && ['create', 'read'].includes(action)) {
      return true;
    }
    // Can create visit touchpoints
    if (resource === 'touchpoints' && action === 'create' && constraint === 'visit') {
      return true;
    }
    // Can read/update own touchpoints and itineraries
    if (['touchpoints', 'itineraries'].includes(resource) && ['read', 'update'].includes(action)) {
      return true;
    }
    // Can read own targets
    if (resource === 'targets' && action === 'read') {
      return true;
    }
    // Can mark own attendance
    if (resource === 'attendance' && action === 'create') {
      return true;
    }
    return false;
  }

  // Tele role
  if (userRole === 'tele') {
    // Can read clients
    if (resource === 'clients' && action === 'read') {
      return true;
    }
    // Can create call touchpoints
    if (resource === 'touchpoints' && action === 'create' && constraint === 'call') {
      return true;
    }
    // Can read/update own touchpoints
    if (resource === 'touchpoints' && ['read', 'update'].includes(action)) {
      return true;
    }
    // Can read itineraries and targets
    if (['itineraries', 'targets'].includes(resource) && action === 'read') {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Get user role from JWT or database
 */
export async function getUserRole(userId: string): Promise<string | null> {
  try {
    // First try to get from user_roles table (RBAC system)
    const result = await pool.query(`
      SELECT r.slug
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
        AND ur.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      ORDER BY r.level DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length > 0) {
      return result.rows[0].slug;
    }

    // Fallback to users.role column (old system)
    const fallback = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );

    if (fallback.rows.length > 0) {
      return fallback.rows[0].role;
    }

    return null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

/**
 * Check if a column exists in a table
 */
export async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2
      )`,
      [table, column]
    );
    return result.rows[0].exists;
  } catch {
    return false;
  }
}

/**
 * Get the actual user ID column name for a table
 * Handles migration from caravan_id to user_id
 */
export async function getUserIdColumn(table: string): Promise<string> {
  // Try user_id first (new system)
  const hasUserId = await columnExists(table, 'user_id');
  if (hasUserId) {
    return 'user_id';
  }

  // Fallback to caravan_id (old system)
  const hasCaravanId = await columnExists(table, 'caravan_id');
  if (hasCaravanId) {
    return 'caravan_id';
  }

  throw new Error(`No user ID column found in table ${table}`);
}

/**
 * Check if user owns a resource
 * Handles both user_id and caravan_id columns
 */
export async function checkResourceOwnership(
  table: string,
  resourceId: string,
  userId: string
): Promise<boolean> {
  try {
    // Get the correct column name
    const userIdColumn = await getUserIdColumn(table);

    const result = await pool.query(
      `SELECT ${userIdColumn} FROM ${table} WHERE id = $1`,
      [resourceId]
    );

    if (result.rows.length === 0) {
      return false; // Resource not found
    }

    const resourceOwnerId = result.rows[0][userIdColumn];
    return resourceOwnerId === userId;
  } catch (error) {
    console.error('Error checking resource ownership:', error);
    return false;
  }
}

/**
 * Validate touchpoint type for user role/permissions
 * Backward compatible with both old and new systems
 */
export async function canCreateTouchpointType(
  userId: string,
  touchpointNumber: number,
  touchpointType: 'Visit' | 'Call'
): Promise<{ allowed: boolean; reason?: string }> {
  // Validate touchpoint number is positive (unlimited touchpoints)
  if (touchpointNumber < 1) {
    return {
      allowed: false,
      reason: 'touchpoint_number must be a positive number',
    };
  }

  // Check permissions (RBAC or role-based)
  const rbacInstalled = await isRbacInstalled();
  const userRole = await getUserRole(userId);

  if (rbacInstalled) {
    // Use RBAC permission check
    const { hasPermission } = await import('./permissions.js');

    if (touchpointType === 'Visit') {
      const canCreate = await hasPermission(userId, 'touchpoints', 'create', 'visit');
      if (!canCreate) {
        return {
          allowed: false,
          reason: 'You do not have permission to create Visit touchpoints',
        };
      }
    } else if (touchpointType === 'Call') {
      const canCreate = await hasPermission(userId, 'touchpoints', 'create', 'call');
      if (!canCreate) {
        return {
          allowed: false,
          reason: 'You do not have permission to create Call touchpoints',
        };
      }
    }
  } else {
    // Fallback to role-based check
    if (touchpointType === 'Visit' && userRole !== 'caravan' &&
!['admin', 'area_manager', 'assistant_area_manager'].includes(userRole || '')) {
      return {
        allowed: false,
        reason: 'Only Caravan users can create Visit touchpoints',
      };
    }

    if (touchpointType === 'Call' && userRole !== 'tele' &&
!['admin', 'area_manager', 'assistant_area_manager'].includes(userRole || '')) {
      return {
        allowed: false,
        reason: 'Only Tele users can create Call touchpoints',
      };
    }
  }

  return { allowed: true };
}
