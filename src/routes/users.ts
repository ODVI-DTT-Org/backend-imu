import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authMiddleware, requireRole, requireAnyRole } from '../middleware/auth.js';
import { addBulkJob } from '../queues/utils/job-helpers.js';
import { BulkJobType } from '../queues/jobs/job-types.js';
import { requirePermission } from '../middleware/permissions.js';
import { auditMiddleware, auditLog, auditAuth } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';
import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DatabaseError,
} from '../errors/index.js';
import { clearPermissionCache } from '../middleware/permissions.js';

const { hash, compare } = bcrypt;

const users = new Hono();

// Valid roles for the role system (field_agent was renamed to caravan in migration 008)
const VALID_ROLES = ['admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'] as const;
const MANAGER_ROLES = ['admin', 'area_manager', 'assistant_area_manager'] as const;
const CARAVAN_ROLES = ['caravan'] as const;
const TELE_ROLES = ['tele'] as const;

// Password complexity regex: min 8 chars, 1 uppercase, 1 lowercase, 1 number
const passwordComplexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().regex(passwordComplexityRegex, 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number'),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  role: z.enum(VALID_ROLES).default('caravan'),
  phone: z.string().optional(),
  avatar_url: z.string().optional(),
});

const updateUserSchema = createUserSchema.partial().omit({ password: true });

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().regex(passwordComplexityRegex, 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number'),
});

// Helper to map DB row to User type
function mapRowToUser(row: Record<string, any>) {
  return {
    id: row.id,
    email: row.email,
    name: `${row.first_name} ${row.last_name}`,
    first_name: row.first_name,
    last_name: row.last_name,
    role: row.role,
    phone: row.phone,
    avatar: row.avatar_url,
    created: row.created_at,
    updated: row.updated_at,
  };
}

// GET /api/users - List all users (admin only)
users.get('/', authMiddleware, requirePermission('users', 'read'), async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '20');
    const search = c.req.query('search');
    const role = c.req.query('role');
    const municipality = c.req.query('municipality');
    const province = c.req.query('province');
    const status = c.req.query('status');

    const offset = (page - 1) * perPage;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role && role !== 'all') {
      conditions.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (status && status !== 'all') {
      if (status === 'active') {
        conditions.push(`deleted_at IS NULL`);
      } else if (status === 'deleted') {
        conditions.push(`deleted_at IS NOT NULL`);
      }
    }

    if (municipality) {
      conditions.push(`EXISTS (
        SELECT 1 FROM user_locations ul
        WHERE ul.user_id = users.id
          AND ul.municipality_id = $${paramIndex}
          AND ul.deleted_at IS NULL
      )`);
      params.push(municipality);
      paramIndex++;
    }

    if (province) {
      conditions.push(`EXISTS (
        SELECT 1 FROM user_locations ul
        WHERE ul.user_id = users.id
          AND ul.province = $${paramIndex}
          AND ul.deleted_at IS NULL
      )`);
      params.push(province);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );
    const totalItems = parseInt(countResult.rows[0].count);

    // Get paginated results
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, phone, avatar_url, created_at, updated_at
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, perPage, offset]
    );

    return c.json({
      items: result.rows.map(mapRowToUser),
      page,
      perPage,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    });
  } catch (error) {
    console.error('Fetch users error:', error);
    throw new Error('Failed to fetch users');
  }
});

// GET /api/users/:id - Get single user
users.get('/:id', authMiddleware, requirePermission('users', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    // Users can only view their own profile unless they're admin/staff
    if (user.role === 'field_agent' && user.sub !== id) {
      throw new AuthorizationError('You can only view your own profile');
    }

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, phone, avatar_url, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    return c.json(mapRowToUser(result.rows[0]));
  } catch (error) {
    console.error('Fetch user error:', error);
    throw error;
  }
});

// POST /api/users - Create new user (admin only)
users.post('/', authMiddleware, requirePermission('users', 'create'), auditMiddleware('user'), async (c) => {
  try {
    const body = await c.req.json();
    const validated = createUserSchema.parse(body);

    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [validated.email]);
    if (existing.rows.length > 0) {
      throw new ConflictError('A user with this email already exists');
    }

    // Hash password
    const password_hash = await hash(validated.password, 10);

    const result = await pool.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, phone, avatar_url)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, first_name, last_name, role, phone, avatar_url, created_at, updated_at`,
      [validated.email, password_hash, validated.first_name, validated.last_name,
       validated.role, validated.phone, validated.avatar_url]
    );

    const newUser = result.rows[0];

    // Get current user for audit logging and RBAC assignment
    const currentUser = c.get('user');

    // Create user profile (note: manager assignments not stored in user_profiles table)
    await pool.query(
      `INSERT INTO user_profiles (id, user_id, name, email, role)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [newUser.id, `${validated.first_name} ${validated.last_name}`, validated.email, validated.role]
    );

    // RBAC Sync: Create user_roles entry for new RBAC system
    try {
      console.log(`[RBAC Sync] Looking up role '${validated.role}' for user ${newUser.id}`);
      const roleResult = await pool.query(
        'SELECT id, slug FROM roles WHERE slug = $1',
        [validated.role]
      );

      console.log(`[RBAC Sync] Role lookup result: ${roleResult.rows.length} rows found`, roleResult.rows);

      if (roleResult.rows.length > 0) {
        const roleId = roleResult.rows[0].id;
        console.log(`[RBAC Sync] Creating user_roles entry: user_id=${newUser.id}, role_id=${roleId}, assigned_by=${currentUser.sub}`);

        await pool.query(
          `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (user_id, role_id) DO UPDATE SET
             is_active = TRUE,
             assigned_by = $3`,
          [newUser.id, roleId, currentUser.sub]
        );

        console.log(`[RBAC Sync] Successfully created user_roles entry for user ${newUser.id}`);
      } else {
        console.error(`[RBAC Sync] Role '${validated.role}' not found in roles table. Available roles:`);
        const allRoles = await pool.query('SELECT slug, name FROM roles ORDER BY level DESC');
        console.error(JSON.stringify(allRoles.rows, null, 2));
        throw new Error(`Role '${validated.role}' not found in roles table. Please ensure the role exists in the roles table.`);
      }
    } catch (rbacError) {
      // Log RBAC error with details
      console.error('[RBAC Sync Error] Failed to create user_roles entry:', rbacError);
      console.error('[RBAC Sync Error] Error details:', {
        message: rbacError instanceof Error ? rbacError.message : String(rbacError),
        stack: rbacError instanceof Error ? rbacError.stack : undefined,
        userId: newUser.id,
        role: validated.role,
        assignedBy: currentUser.sub
      });

      // Check if roles table exists
      try {
        const tableCheck = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'roles'
          )
        `);
        console.log('[RBAC Sync Debug] roles table exists:', tableCheck.rows[0].exists);

        if (tableCheck.rows[0].exists) {
          const allRoles = await pool.query('SELECT slug, name FROM roles ORDER BY level DESC');
          console.log('[RBAC Sync Debug] Available roles in database:', allRoles.rows);
        }
      } catch (checkError) {
        console.error('[RBAC Sync Debug] Failed to check roles table:', checkError);
      }

      // Re-throw the error to fail user creation if RBAC sync fails
      // This ensures data consistency - users should NOT be created without proper RBAC entries
      throw new Error(`Failed to create RBAC entry for user: ${rbacError instanceof Error ? rbacError.message : String(rbacError)}`);
    }

    // Audit log the user creation
    await auditLog({
      userId: currentUser.sub,
      action: 'create',
      entity: 'user',
      entityId: newUser.id,
      newValues: {
        email: validated.email,
        first_name: validated.first_name,
        last_name: validated.last_name,
        role: validated.role,
        phone: validated.phone,
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    return c.json(mapRowToUser(newUser), 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Create user error:', error);
    throw new Error('Failed to create user');
  }
});

// PUT /api/users/:id - Update user
users.put('/:id', authMiddleware, requirePermission('users', 'update'), auditMiddleware('user'), async (c) => {
  try {
    const currentUser = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = updateUserSchema.parse(body);

    // Users can only update their own profile unless they're admin
    if (currentUser.role !== 'admin' && currentUser.sub !== id) {
      throw new AuthorizationError('You can only update your own profile');
    }

   // Only admins can change roles
    if (validated.role && currentUser.role !== 'admin') {
      throw new AuthorizationError('Only admins can change roles');
    }

    // Check if user exists
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Store old values for audit log
    const oldUser = existing.rows[0];

    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      email: 'email',
      first_name: 'first_name',
      last_name: 'last_name',
      role: 'role',
      phone: 'phone',
      avatar_url: 'avatar_url',
    };

    // Handle password separately (needs hashing)
    if (body.password && typeof body.password === 'string') {
      const hashedPassword = await hash(body.password, 10);
      updateFields.push(`password_hash = $${paramIndex}`);
      updateValues.push(hashedPassword);
      paramIndex++;
    }

    for (const [key, dbField] of Object.entries(fieldMappings)) {
      if (key in validated) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        updateValues.push((validated as any)[key]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updateValues.push(id);
    const result = await pool.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, first_name, last_name, role, phone, avatar_url, created_at, updated_at`,
      updateValues
    );

    const updatedUser = result.rows[0];

    // Update user_profiles if name, email, or role changed
    if (validated.first_name || validated.last_name || validated.email || validated.role) {
      try {
        await pool.query(
          `UPDATE user_profiles
           SET name = COALESCE($1, name),
               email = COALESCE($2, email),
               role = COALESCE($3, role)
           WHERE user_id = $4`,
          [
            validated.first_name && validated.last_name ?
              `${validated.first_name} ${validated.last_name}` : null,
            validated.email || null,
            validated.role || null,
            id
          ]
        );
      } catch (profileError) {
        console.error('User profile sync error during user update:', profileError);
        // Don't fail the update if profile sync fails
      }
    }

    // RBAC Sync: Update user_roles if role changed
    if (validated.role && oldUser.role !== updatedUser.role) {
      try {
        console.log(`[RBAC Sync] Looking up new role '${updatedUser.role}' for user ${id}`);

        // Get the new role ID
        const newRoleResult = await pool.query(
          'SELECT id, slug FROM roles WHERE slug = $1',
          [updatedUser.role]
        );

        console.log(`[RBAC Sync] Role lookup result: ${newRoleResult.rows.length} rows found`, newRoleResult.rows);

        if (newRoleResult.rows.length > 0) {
          const newRoleId = newRoleResult.rows[0].id;
          console.log(`[RBAC Sync] Deactivating old roles and assigning new role: user_id=${id}, role_id=${newRoleId}`);

          // Deactivate all old role assignments for this user
          await pool.query(
            `UPDATE user_roles
             SET is_active = FALSE
             WHERE user_id = $1`,
            [id]
          );

          // Create new role assignment
          await pool.query(
            `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (user_id, role_id) DO UPDATE SET
               is_active = TRUE,
               assigned_by = $3`,
            [id, newRoleId, currentUser.sub]
          );

          console.log(`[RBAC Sync] Successfully updated user_roles for user ${id}`);

          // Clear permission cache for this user
          if (id) {
            clearPermissionCache(id);
            console.log(`[RBAC Sync] Cleared permission cache for user ${id}`);
          }
        } else {
          console.error(`[RBAC Sync] Role '${updatedUser.role}' not found in roles table. Available roles:`);
          const allRoles = await pool.query('SELECT slug, name FROM roles ORDER BY level DESC');
          console.error(JSON.stringify(allRoles.rows, null, 2));
          throw new Error(`Role '${updatedUser.role}' not found in roles table. Cannot update user role.`);
        }
      } catch (rbacError) {
        // Log RBAC error with details
        console.error('[RBAC Sync Error] Failed to update user_roles entry:', rbacError);
        console.error('[RBAC Sync Error] Error details:', {
          message: rbacError instanceof Error ? rbacError.message : String(rbacError),
          stack: rbacError instanceof Error ? rbacError.stack : undefined,
          userId: id,
          oldRole: oldUser.role,
          newRole: updatedUser.role,
          assignedBy: currentUser.sub
        });

        // Re-throw the error to fail user update if RBAC sync fails
        throw new Error(`Failed to update RBAC entry for user: ${rbacError instanceof Error ? rbacError.message : String(rbacError)}`);
      }
    }

    // Audit log the user update
    await auditLog({
      userId: currentUser.sub,
      action: 'update',
      entity: 'user',
      entityId: id,
      oldValues: {
        email: oldUser.email,
        first_name: oldUser.first_name,
        last_name: oldUser.last_name,
        role: oldUser.role,
        phone: oldUser.phone,
        avatar_url: oldUser.avatar_url,
      },
      newValues: {
        email: updatedUser.email,
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        role: updatedUser.role,
        phone: updatedUser.phone,
        avatar_url: updatedUser.avatar_url,
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    return c.json(mapRowToUser(updatedUser));
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Update user error:', error);
    throw new Error('Failed to update user');
  }
});

// POST /api/users/:id/change-password - Change password
users.post('/:id/change-password', authMiddleware, async (c) => {
  try {
    const currentUser = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = changePasswordSchema.parse(body);

    // Users can only change their own password
    if (currentUser.sub !== id) {
      throw new AuthorizationError('You can only change your own password');
    }

    // Get current user
    const existing = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Verify current password
    const valid = await compare(validated.current_password, existing.rows[0].password_hash);
    if (!valid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash and update new password
    const password_hash = await hash(validated.new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, id]);

    // Audit log password change
    await auditAuth.passwordChange(
      currentUser.sub,
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip')
    );

    return c.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Change password error:', error);
    throw new Error('Failed to change password');
  }
});

// POST /api/users/:id/reset-password - Admin reset password (no current password required)
const resetPasswordSchema = z.object({
  new_password: z.string().regex(passwordComplexityRegex, 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number'),
});

users.post('/:id/reset-password', authMiddleware, requirePermission('users', 'update'), async (c) => {
  try {
    const currentUser = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = resetPasswordSchema.parse(body);

    // Check if user exists
    const existing = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Hash and update new password
    const password_hash = await hash(validated.new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, id]);

    // Audit log password reset
    await auditLog({
      userId: currentUser.sub,
      action: 'password_reset',
      entity: 'user',
      entityId: id,
      newValues: {
        email: existing.rows[0].email,
        first_name: existing.rows[0].first_name,
        last_name: existing.rows[0].last_name,
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ message: 'Password reset successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Reset password error:', error);
    throw new Error('Failed to reset password');
  }
});

// DELETE /api/users/:id - Delete user (admin only)
users.delete('/:id', authMiddleware, requirePermission('users', 'delete'), auditMiddleware('user'), async (c) => {
  try {
    const currentUser = c.get('user');
    const id = c.req.param('id');

    // Prevent self-deletion
    if (currentUser.sub === id) {
      throw new ValidationError('Cannot delete your own account');
    }

    // Get user before deletion for audit log
    const existing = await pool.query(
      'SELECT id, email, first_name, last_name, role FROM users WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const oldUser = existing.rows[0];

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    // Audit log the user deletion
    await auditLog({
      userId: currentUser.sub,
      action: 'delete',
      entity: 'user',
      entityId: id,
      oldValues: {
        email: oldUser.email,
        first_name: oldUser.first_name,
        last_name: oldUser.last_name,
        role: oldUser.role,
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    throw new Error('Failed to delete user');
  }
});

// ============================================
// MUNICIPALITY ASSIGNMENT ENDPOINTS
// ============================================

// GET /api/users/:id/municipalities - Get assigned municipalities for a user
users.get('/:id/municipalities', authMiddleware, async (c) => {
  try {
    const userId = c.req.param('id');

    // Verify user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Check if user_locations table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_locations'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      return c.json({ items: [] });
    }

    // Get assigned municipalities (not deleted)
    const result = await pool.query(
      `SELECT
        ums.id,
        ums.province,
        ums.municipality,
        ums.assigned_at,
        ums.assigned_by,
        p.region,
        p.province as psgc_province,
        p.mun_city as municipality_name
       FROM user_locations ums
       LEFT JOIN psgc p ON TRIM(p.province) = ums.province AND TRIM(p.mun_city) = ums.municipality
       WHERE ums.user_id = $1 AND ums.deleted_at IS NULL
       ORDER BY ums.assigned_at DESC`,
      [userId]
    );

    // Map results to expected format
    const items = result.rows.map(row => ({
      id: row.id,
      province: row.province || row.psgc_province || '',
      municipality: row.municipality,
      municipality_name: row.municipality_name || row.municipality,
      region_name: row.region || '',
      region_code: row.region || '',
      assigned_at: row.assigned_at,
      assigned_by: row.assigned_by,
    }));

    return c.json({ items });
  } catch (error) {
    console.error('Fetch user municipalities error:', error);
    return c.json({ items: [] });
  }
});

// POST /api/users/:id/municipalities - Assign municipalities to user (admin, area_manager, assistant_area_manager)
users.post('/:id/municipalities', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
  try {
    const currentUser = c.get('user');
    const userId = c.req.param('id');

    const body = await c.req.json();
    const schema = z.object({
      locations: z.array(z.object({
        province: z.string().min(1),
        municipality: z.string().min(1),
      })).min(1),
    });
    const validated = schema.parse(body);

    // Verify user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Verify all municipalities exist in PSGC table
    for (const assignment of validated.locations) {
      const { province, municipality } = assignment;

      const check = await pool.query(
        `SELECT 1 FROM psgc WHERE TRIM(province) = $1 AND TRIM(mun_city) = $2 LIMIT 1`,
        [province, municipality]
      );

      if (check.rows.length === 0) {
        throw new NotFoundError(`Municipality not found: ${province}-${municipality}`);
      }
    }

    // Insert user assignments (upsert - handle re-assignments)
    let assignedCount = 0;
    for (const assignment of validated.locations) {
      const { province, municipality } = assignment;

      const existing = await pool.query(
        'SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND province = $2 AND municipality = $3',
        [userId, province, municipality]
      );

      if (existing.rows.length > 0) {
        if (existing.rows[0].deleted_at) {
          await pool.query(
            'UPDATE user_locations SET deleted_at = NULL, assigned_at = NOW(), assigned_by = $1 WHERE id = $2',
            [currentUser.sub, existing.rows[0].id]
          );
          assignedCount++;
        }
      } else {
        await pool.query(
          'INSERT INTO user_locations (id, user_id, province, municipality, assigned_at, assigned_by) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4)',
          [userId, province, municipality, currentUser.sub]
        );
        assignedCount++;
      }
    }

    if (assignedCount === 0) {
      throw new ValidationError('No new municipalities were assigned. All selected municipalities are already assigned to this user.');
    }

    return c.json({
      message: `Municipalities assigned successfully to user`,
      assigned_count: assignedCount,
    });
  } catch (error: any) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }

    // Re-throw AppError instances directly (they already have proper status codes)
    if (error instanceof AppError) {
      throw error;
    }

    // Check for column does not exist error (schema mismatch)
    if (error.code === '42703') {
      logger.error('users/municipalities', 'Database schema mismatch', {
        column: error.message,
        hint: 'Run migration 037 to fix user_locations column name',
        table: 'user_locations'
      });
      throw new DatabaseError('Database schema mismatch. Please contact administrator.')
        .addDetail('missingColumn', 'municipality_id')
        .addDetail('requiredMigration', '037_fix_user_locations_municipality_column');
    }

    // Check for relation does not exist error
    if (error.code === '42P01') {
      logger.error('users/municipalities', 'Table does not exist', {
        table: error.message,
        hint: 'Run migration 020 to create user_locations table'
      });
      throw new DatabaseError('Database table missing. Please contact administrator.')
        .addDetail('missingTable', 'user_locations');
    }

    // Wrap other database errors in DatabaseError
    if (error.code === '23503' || error.code === '23505' || error.code?.startsWith('23')) {
      throw new DatabaseError(`Database error while assigning municipalities: ${error.message}`)
        .addDetail('originalError', error.message);
    }

    // Wrap unknown errors with full details
    console.error('Assign municipalities error:', error);
    console.error('Error name:', error.name);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    throw new DatabaseError('Failed to assign municipalities')
      .addDetail('originalError', error.message);
  }
});

// POST /api/users/:id/municipalities/bulk - Bulk unassign municipalities (admin, area_manager, assistant_area_manager)
users.post('/:id/municipalities/bulk', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
  try {
    const userId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      locations: z.array(z.object({
        province: z.string().min(1),
        municipality: z.string().min(1),
      })).min(1),
    });
    const validated = schema.parse(body);

    // Verify user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Bulk soft delete from user_locations
    let deletedCount = 0;
    for (const assignment of validated.locations) {
      const { province, municipality } = assignment;

      const result = await pool.query(
        `UPDATE user_locations
         SET deleted_at = NOW()
         WHERE user_id = $1
           AND province = $2
           AND municipality = $3
           AND deleted_at IS NULL
         RETURNING id`,
        [userId, province, municipality]
      );
      deletedCount += result.rowCount || 0;
    }

    return c.json({
      message: `Bulk unassigned ${deletedCount} municipalities`,
      deleted_count: deletedCount,
    });
  } catch (error: any) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }

    // Re-throw AppError instances directly (they already have proper status codes)
    if (error instanceof AppError) {
      throw error;
    }

    // Wrap database errors in DatabaseError
    if (error.code === '23503' || error.code === '23505' || error.code?.startsWith('23')) {
      throw new DatabaseError(`Database error while unassigning municipalities: ${error.message}`)
        .addDetail('originalError', error.message);
    }

    // Wrap unknown errors
    console.error('Bulk unassign municipalities error:', error);
    throw new DatabaseError('Failed to unassign municipalities')
      .addDetail('originalError', error.message);
  }
});

// DELETE /api/users/:id/locations/:province/:municipality - Unassign location from user (admin, area_manager, assistant_area_manager)
users.delete('/:id/locations/:province/:municipality', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
  try {
    const userId = c.req.param('id');
    const province = c.req.param('province');
    const municipality = c.req.param('municipality');

    // Validate required parameters
    if (!province || !municipality) {
      throw new ValidationError('province and municipality are required');
    }

    // Verify user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Note: province and municipality are already extracted from route params above

    const existing = await pool.query(
      'SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND province = $2 AND municipality = $3',
      [userId, province, municipality]
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError('Assignment');
    }

    const record = existing.rows[0];

    // If already deleted, still return success (idempotent)
    if (record.deleted_at === null) {
      await pool.query(
        'UPDATE user_locations SET deleted_at = NOW() WHERE id = $1',
        [record.id]
      );
    }

    return c.json({ message: 'Location unassigned successfully' });
  } catch (error: any) {
    // Re-throw AppError instances directly (they already have proper status codes)
    if (error instanceof AppError) {
      throw error;
    }

    // Wrap database errors in DatabaseError
    if (error.code === '23503' || error.code === '23505' || error.code?.startsWith('23')) {
      throw new DatabaseError(`Database error while unassigning location: ${error.message}`)
        .addDetail('originalError', error.message);
    }

    // Wrap unknown errors
    console.error('Unassign location error:', error);
    throw new DatabaseError('Failed to unassign location')
      .addDetail('originalError', error.message);
  }
});

// GET /api/users/roles - Get all available roles
users.get('/roles', authMiddleware, async (c) => {
  try {
    // Return all available roles with friendly labels
    const roles = [
      { value: 'admin', label: 'Admin' },
      { value: 'area_manager', label: 'Area Manager' },
      { value: 'assistant_area_manager', label: 'Assistant Area Manager' },
      { value: 'caravan', label: 'Caravan' },
      { value: 'tele', label: 'Tele' },
      { value: 'staff', label: 'Staff' },
      { value: 'field_agent', label: 'Field Agent' }
    ];

    return c.json({ roles });
  } catch (error) {
    console.error('Get roles error:', error);
    throw new Error('Failed to get roles');
  }
});

// Bulk delete users validation schema
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
});

// Bulk delete users (now queued)
users.post('/bulk-delete', authMiddleware, requireRole('admin'), auditMiddleware('user', 'bulk_delete'), async (c) => {
  const user = c.get('user');
  if (!user) throw new AuthenticationError('Unauthorized');

  try {
    const body = await c.req.json();
    const { ids } = bulkDeleteSchema.parse(body);

    // Prevent self-deletion
    if (ids.includes(user.sub)) {
      throw new ValidationError('Cannot delete your own account');
    }

    // Create bulk delete job
    const job = await addBulkJob(
      BulkJobType.BULK_DELETE_USERS,
      user.sub,
      ids,
      { preventSelfDeletion: true }
    );

    // Return immediately with job information
    return c.json({
      success: true,
      job_id: job.id,
      message: `Bulk delete job started for ${ids.length} users`,
      status_url: `/api/jobs/${job.id}`,
      estimated_time: `${Math.ceil(ids.length / 50)} minutes`,
    }, 201);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk delete users error:', error);
    throw new Error('Failed to create bulk delete job');
  }
});

export default users;
