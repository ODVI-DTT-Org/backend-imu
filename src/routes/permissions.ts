/**
 * Permission Management API Routes
 *
 * These routes provide administrative interfaces for managing the RBAC system.
 * All routes require admin or area manager permissions.
 *
 * @file permissions.ts
 * @module routes/permissions
 */

import { Hono } from 'hono';
import { pool } from '../db/index.js';
import {
  requirePermission,
  checkOwnership,
  clearPermissionCache,
  clearAllPermissionCache,
} from '../middleware/permissions.js';
import type {
  CreateRoleRequest,
  UpdateRoleRequest,
  CreatePermissionRequest,
  AssignRoleRequest,
  CheckPermissionsRequest,
  RoleWithPermissions,
  UserRoleAssignment,
  PermissionError,
} from '../types/rbac.js';

const permissions = new Hono();

// ============================================
// ROLE MANAGEMENT
// ============================================

/**
 * GET /permissions/roles
 * List all roles with their permissions
 */
permissions.get('/roles', requirePermission('roles', 'read'), async (c) => {
  try {
    const result = await pool.query(
      `SELECT
        r.id,
        r.name,
        r.slug,
        r.description,
        r.level,
        r.is_system,
        COUNT(rp.permission_id) as permission_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      GROUP BY r.id
      ORDER BY r.level DESC`
    );

    return c.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    return c.json({ success: false, message: 'Failed to fetch roles' }, 500);
  }
});

/**
 * GET /permissions/roles/:id
 * Get specific role with all permissions
 */
permissions.get('/roles/:id', requirePermission('roles', 'read'), async (c) => {
  try {
    const roleId = c.req.param('id');

    const roleResult = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);

    if (roleResult.rows.length === 0) {
      return c.json({ success: false, message: 'Role not found' }, 404);
    }

    const role = roleResult.rows[0];

    const permissionsResult = await pool.query(
      `SELECT
        p.resource,
        p.action,
        p.constraint_name,
        p.description
      FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = $1
      ORDER BY p.resource, p.action`,
      [roleId]
    );

    const roleWithPermissions: RoleWithPermissions = {
      name: role.name,
      slug: role.slug,
      description: role.description,
      level: role.level,
      is_system: role.is_system,
      permissions: permissionsResult.rows,
    };

    return c.json({
      success: true,
      data: roleWithPermissions,
    });
  } catch (error) {
    console.error('Error fetching role:', error);
    return c.json({ success: false, message: 'Failed to fetch role' }, 500);
  }
});

/**
 * POST /permissions/roles
 * Create a new role
 */
permissions.post('/roles', requirePermission('roles', 'create'), async (c) => {
  try {
    const body = await c.req.json();
    const { name, slug, description, level, is_system }: CreateRoleRequest = body;

    if (!name) {
      return c.json({ success: false, message: 'Role name is required' }, 400);
    }

    // Generate slug from name if not provided
    const roleSlug = slug || name.toLowerCase().replace(/\s+/g, '_');

    const result = await pool.query(
      `INSERT INTO roles (name, slug, description, level, is_system)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, roleSlug, description || null, level || 0, is_system || false]
    );

    return c.json({
      success: true,
      data: result.rows[0],
      message: 'Role created successfully',
    });
  } catch (error: any) {
    console.error('Error creating role:', error);

    if (error.code === '23505') {
      // Unique violation
      return c.json({ success: false, message: 'Role with this slug already exists' }, 409);
    }

    return c.json({ success: false, message: 'Failed to create role' }, 500);
  }
});

/**
 * PUT /permissions/roles/:id
 * Update a role
 */
permissions.put('/roles/:id', requirePermission('roles', 'update'), async (c) => {
  try {
    const roleId = c.req.param('id');
    const body = await c.req.json();
    const { name, description, level }: UpdateRoleRequest = body;

    // Check if role exists and is not a system role
    const existingRole = await pool.query(
      'SELECT * FROM roles WHERE id = $1',
      [roleId]
    );

    if (existingRole.rows.length === 0) {
      return c.json({ success: false, message: 'Role not found' }, 404);
    }

    if (existingRole.rows[0].is_system) {
      return c.json({ success: false, message: 'Cannot modify system roles' }, 403);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (level !== undefined) {
      updates.push(`level = $${paramIndex++}`);
      values.push(level);
    }

    if (updates.length === 0) {
      return c.json({ success: false, message: 'No fields to update' }, 400);
    }

    values.push(roleId);

    const result = await pool.query(
      `UPDATE roles
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return c.json({
      success: true,
      data: result.rows[0],
      message: 'Role updated successfully',
    });
  } catch (error) {
    console.error('Error updating role:', error);
    return c.json({ success: false, message: 'Failed to update role' }, 500);
  }
});

/**
 * DELETE /permissions/roles/:id
 * Delete a role
 */
permissions.delete('/roles/:id', requirePermission('roles', 'delete'), async (c) => {
  try {
    const roleId = c.req.param('id');

    // Check if role exists and is not a system role
    const existingRole = await pool.query(
      'SELECT * FROM roles WHERE id = $1',
      [roleId]
    );

    if (existingRole.rows.length === 0) {
      return c.json({ success: false, message: 'Role not found' }, 404);
    }

    if (existingRole.rows[0].is_system) {
      return c.json({ success: false, message: 'Cannot delete system roles' }, 403);
    }

    // Check if role is assigned to any users
    const userCount = await pool.query(
      'SELECT COUNT(*) FROM user_roles WHERE role_id = $1 AND is_active = TRUE',
      [roleId]
    );

    if (parseInt(userCount.rows[0].count) > 0) {
      return c.json({
        success: false,
        message: 'Cannot delete role that is assigned to users',
      }, 409);
    }

    await pool.query('DELETE FROM roles WHERE id = $1', [roleId]);

    return c.json({
      success: true,
      message: 'Role deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting role:', error);
    return c.json({ success: false, message: 'Failed to delete role' }, 500);
  }
});

// ============================================
// PERMISSION MANAGEMENT
// ============================================

/**
 * GET /permissions/list
 * List all permissions
 */
permissions.get('/list', requirePermission('permissions', 'read'), async (c) => {
  try {
    const result = await pool.query(
      `SELECT
        p.id,
        p.resource,
        p.action,
        p.constraint_name,
        p.description
      FROM permissions p
      ORDER BY p.resource, p.action`
    );

    // Group by resource
    const grouped = result.rows.reduce((acc: any, perm: any) => {
      if (!acc[perm.resource]) {
        acc[perm.resource] = [];
      }
      acc[perm.resource].push({
        id: perm.id,
        action: perm.action,
        constraint_name: perm.constraint_name,
        description: perm.description,
      });
      return acc;
    }, {});

    return c.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return c.json({ success: false, message: 'Failed to fetch permissions' }, 500);
  }
});

/**
 * POST /permissions/permissions
 * Create a new permission
 */
permissions.post('/permissions', requirePermission('permissions', 'create'), async (c) => {
  try {
    const body = await c.req.json();
    const { resource, action, description, constraint_name }: CreatePermissionRequest = body;

    if (!resource || !action) {
      return c.json({
        success: false,
        message: 'Resource and action are required',
      }, 400);
    }

    const result = await pool.query(
      `INSERT INTO permissions (resource, action, description, constraint_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [resource, action, description || null, constraint_name || null]
    );

    return c.json({
      success: true,
      data: result.rows[0],
      message: 'Permission created successfully',
    });
  } catch (error: any) {
    console.error('Error creating permission:', error);

    if (error.code === '23505') {
      return c.json({
        success: false,
        message: 'Permission with this resource/action/constraint already exists',
      }, 409);
    }

    return c.json({ success: false, message: 'Failed to create permission' }, 500);
  }
});

/**
 * POST /permissions/roles/:roleId/permissions
 * Assign permission to role
 */
permissions.post('/roles/:roleId/permissions', requirePermission('roles', 'update'), async (c) => {
  try {
    const roleId = c.req.param('id');
    const body = await c.req.json();
    const { permission_id } = body;

    if (!permission_id) {
      return c.json({ success: false, message: 'Permission ID is required' }, 400);
    }

    // Verify role exists
    const roleCheck = await pool.query('SELECT id FROM roles WHERE id = $1', [roleId]);
    if (roleCheck.rows.length === 0) {
      return c.json({ success: false, message: 'Role not found' }, 404);
    }

    // Verify permission exists
    const permCheck = await pool.query('SELECT id FROM permissions WHERE id = $1', [permission_id]);
    if (permCheck.rows.length === 0) {
      return c.json({ success: false, message: 'Permission not found' }, 404);
    }

    const user = c.get('user');

    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleId, permission_id, user.sub]
    );

    // Clear permission cache for all users with this role
    await pool.query(
      `DELETE FROM user_roles WHERE role_id = $1`,
      [roleId]
    );

    // Re-insert user_roles to trigger cache invalidation
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
       SELECT u.id, $1, $2, TRUE
       FROM users u
       WHERE u.role = (SELECT slug FROM roles WHERE id = $1)`,
      [roleId, user.sub]
    );

    clearAllPermissionCache();

    return c.json({
      success: true,
      message: 'Permission assigned to role successfully',
    });
  } catch (error) {
    console.error('Error assigning permission:', error);
    return c.json({ success: false, message: 'Failed to assign permission' }, 500);
  }
});

/**
 * DELETE /permissions/roles/:roleId/permissions/:permissionId
 * Remove permission from role
 */
permissions.delete('/roles/:roleId/permissions/:permissionId', requirePermission('roles', 'update'), async (c) => {
  try {
    const roleId = c.req.param('roleId');
    const permissionId = c.req.param('permissionId');

    await pool.query(
      'DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
      [roleId, permissionId]
    );

    clearAllPermissionCache();

    return c.json({
      success: true,
      message: 'Permission removed from role successfully',
    });
  } catch (error) {
    console.error('Error removing permission:', error);
    return c.json({ success: false, message: 'Failed to remove permission' }, 500);
  }
});

// ============================================
// USER ROLE ASSIGNMENT
// ============================================

/**
 * GET /permissions/users/:userId/roles
 * Get all roles assigned to a user
 */
permissions.get('/users/:userId/roles', requirePermission('users', 'read'), async (c) => {
  try {
    const userId = c.req.param('userId');

    const result = await pool.query(
      `SELECT
        ur.id,
        ur.user_id,
        ur.role_id,
        r.name as role_name,
        r.slug as role_slug,
        ur.assigned_at,
        ur.assigned_by,
        ur.expires_at,
        ur.is_active
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
      ORDER BY ur.assigned_at DESC`,
      [userId]
    );

    return c.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return c.json({ success: false, message: 'Failed to fetch user roles' }, 500);
  }
});

/**
 * POST /permissions/users/:userId/roles
 * Assign role to user
 */
permissions.post('/users/:userId/roles', requirePermission('users', 'assign_role'), async (c) => {
  try {
    const userId = c.req.param('userId');
    const body = await c.req.json();
    const { role_id, expires_at }: AssignRoleRequest = body;

    if (!role_id) {
      return c.json({ success: false, message: 'Role ID is required' }, 400);
    }

    // Verify user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return c.json({ success: false, message: 'User not found' }, 404);
    }

    // Verify role exists
    const roleCheck = await pool.query('SELECT id FROM roles WHERE id = $1', [role_id]);
    if (roleCheck.rows.length === 0) {
      return c.json({ success: false, message: 'Role not found' }, 404);
    }

    const currentUser = c.get('user');

    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by, expires_at, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (user_id, role_id) DO UPDATE SET
         is_active = TRUE,
         expires_at = EXCLUDED.expires_at,
         assigned_by = $3`,
      [userId, role_id, currentUser.sub, expires_at || null]
    );

    // Clear permission cache for this user
    if (userId) {
      clearPermissionCache(userId);
    }

    return c.json({
      success: true,
      message: 'Role assigned to user successfully',
    });
  } catch (error) {
    console.error('Error assigning role:', error);
    return c.json({ success: false, message: 'Failed to assign role' }, 500);
  }
});

/**
 * DELETE /permissions/users/:userId/roles/:roleId
 * Remove role from user
 */
permissions.delete('/users/:userId/roles/:roleId', requirePermission('users', 'assign_role'), async (c) => {
  try {
    const userId = c.req.param('userId');
    const roleId = c.req.param('roleId');

    await pool.query(
      `UPDATE user_roles
       SET is_active = FALSE
       WHERE user_id = $1 AND role_id = $2`,
      [userId, roleId]
    );

    // Clear permission cache for this user
    if (userId) {
      clearPermissionCache(userId);
    }

    return c.json({
      success: true,
      message: 'Role removed from user successfully',
    });
  } catch (error) {
    console.error('Error removing role:', error);
    return c.json({ success: false, message: 'Failed to remove role' }, 500);
  }
});

// ============================================
// PERMISSION CHECKING
// ============================================

/**
 * POST /permissions/check
 * Check if current user has specific permissions
 */
permissions.post('/check', async (c) => {
  try {
    const user = c.get('user');

    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { permissions: permsToCheck }: CheckPermissionsRequest = body;

    if (!permsToCheck || !Array.isArray(permsToCheck)) {
      return c.json({ success: false, message: 'Permissions array is required' }, 400);
    }

    const { hasPermission } = await import('../middleware/permissions.js');

    const results = await Promise.all(
      permsToCheck.map(async (perm) => ({
        resource: perm.resource,
        action: perm.action,
        constraint_name: perm.constraint_name,
        granted: await hasPermission(user.sub, perm.resource, perm.action, perm.constraint_name),
      }))
    );

    const allGranted = results.every((r) => r.granted);

    return c.json({
      success: true,
      has_permission: allGranted,
      permissions: results,
    });
  } catch (error) {
    console.error('Error checking permissions:', error);
    return c.json({ success: false, message: 'Failed to check permissions' }, 500);
  }
});

/**
 * GET /permissions/me
 * Get all permissions for current user
 */
permissions.get('/me', async (c) => {
  try {
    const user = c.get('user');

    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const { getUserPermissions } = await import('../middleware/permissions.js');
    const permissions = await getUserPermissions(user.sub);

    // Group by resource
    const grouped = permissions.reduce((acc: any, perm: any) => {
      if (!acc[perm.resource]) {
        acc[perm.resource] = [];
      }
      acc[perm.resource].push({
        action: perm.action,
        constraint: perm.constraint_name,
      });
      return acc;
    }, {});

    return c.json({
      success: true,
      data: {
        email: user.email,
        role: user.role,
        permissions: grouped,
      },
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return c.json({ success: false, message: 'Failed to fetch permissions' }, 500);
  }
});

/**
 * GET /permissions/users/:userId/permissions
 * Get all permissions for a specific user (admin only)
 */
permissions.get('/users/:userId/permissions', requirePermission('users', 'read'), async (c) => {
  try {
    const userId = c.req.param('userId');

    const result = await pool.query(
      `SELECT
        upv.resource,
        upv.action,
        upv.constraint_name,
        upv.role_slug
      FROM user_permissions_view upv
      WHERE upv.user_id = $1
      ORDER BY upv.resource, upv.action`,
      [userId]
    );

    // Group by resource
    const grouped = result.rows.reduce((acc: any, perm: any) => {
      if (!acc[perm.resource]) {
        acc[perm.resource] = [];
      }
      acc[perm.resource].push({
        action: perm.action,
        constraint: perm.constraint_name,
        role: perm.role_slug,
      });
      return acc;
    }, {});

    return c.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return c.json({ success: false, message: 'Failed to fetch permissions' }, 500);
  }
});

// ============================================
// PERMISSION MATRIX
// ============================================

/**
 * GET /permissions/matrix
 * Get complete permission matrix for all roles
 */
permissions.get('/matrix', requirePermission('permissions', 'read'), async (c) => {
  try {
    const result = await pool.query(
      `SELECT
        r.slug as role_slug,
        r.name as role_name,
        p.resource,
        p.action,
        p.constraint_name
      FROM roles r
      JOIN role_permissions rp ON r.id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      ORDER BY r.level DESC, p.resource, p.action`
    );

    // Build matrix
    const matrix: any = {};

    result.rows.forEach((row: any) => {
      if (!matrix[row.role_slug]) {
        matrix[row.role_slug] = {
          name: row.role_name,
          permissions: {},
        };
      }

      if (!matrix[row.role_slug].permissions[row.resource]) {
        matrix[row.role_slug].permissions[row.resource] = [];
      }

      matrix[row.role_slug].permissions[row.resource].push({
        action: row.action,
        constraint: row.constraint_name,
      });
    });

    return c.json({
      success: true,
      data: matrix,
    });
  } catch (error) {
    console.error('Error fetching permission matrix:', error);
    return c.json({ success: false, message: 'Failed to fetch permission matrix' }, 500);
  }
});

export default permissions;
