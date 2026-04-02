import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authMiddleware, requireRole, requireAnyRole } from '../middleware/auth.js';
import { auditMiddleware, auditLog, auditAuth } from '../middleware/audit.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
} from '../errors/index.js';
import { clearPermissionCache } from '../middleware/permissions.js';

const { hash, compare } = bcrypt;

const users = new Hono();

// Valid roles for the role system (field_agent was renamed to caravan in migration 008)
const VALID_ROLES = ['admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele'] as const;
const MANAGER_ROLES = ['admin', 'area_manager', 'assistant_area_manager'] as const;
const CARAVAN_ROLES = ['caravan'] as const;
const TELE_ROLES = ['tele'] as const;

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  role: z.enum(VALID_ROLES).default('caravan'),
  phone: z.string().optional(),
  avatar_url: z.string().optional(),
  // Manager assignment fields
  area_manager_id: z.string().uuid().optional(),
  assistant_area_manager_id: z.string().uuid().optional(),
});

const updateUserSchema = createUserSchema.partial().omit({ password: true });

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6),
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
    area_manager_id: row.area_manager_id,
    assistant_area_manager_id: row.assistant_area_manager_id,
    created: row.created_at,
    updated: row.updated_at,
  };
}

// GET /api/users - List all users (admin only)
users.get('/', authMiddleware, requireRole('admin', 'staff'), async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const perPage = parseInt(c.req.query('perPage') || '20');
    const search = c.req.query('search');
    const role = c.req.query('role');

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
users.get('/:id', authMiddleware, async (c) => {
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
users.post('/', authMiddleware, auditMiddleware('user'), requireRole('admin'), async (c) => {
  try {
    const body = await c.req.json();
    const validated = createUserSchema.parse(body);

    // Validate role-specific manager assignment constraints
    if (CARAVAN_ROLES.includes(validated.role as any)) {
      // Caravans must have at least one manager assigned
      if (!validated.area_manager_id && !validated.assistant_area_manager_id) {
        return c.json({
          message: 'Caravan users must be assigned to an Area Manager or Assistant Area Manager'
        }, 400);
      }
    } else if (validated.role === 'tele') {
      // Tele users work independently and cannot have manager assignments
      if (validated.area_manager_id || validated.assistant_area_manager_id) {
        return c.json({
          message: 'Tele users cannot have manager assignments'
        }, 400);
      }
    } else if (validated.role === 'assistant_area_manager') {
      // Assistant Area Managers must have an Area Manager
      if (!validated.area_manager_id) {
        throw new ValidationError('Assistant Area Manager must be assigned to an Area Manager');
      }
    } else if (validated.role === 'area_manager') {
      // Area Managers cannot have manager assignments
      if (validated.area_manager_id || validated.assistant_area_manager_id) {
        throw new ValidationError('Area Managers cannot be assigned to other managers');
      }
    }

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

    // Create user profile with manager assignments
    await pool.query(
      `INSERT INTO user_profiles (id, user_id, name, email, role, area_manager_id, assistant_area_manager_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
      [newUser.id, `${validated.first_name} ${validated.last_name}`, validated.email,
       validated.role, validated.area_manager_id, validated.assistant_area_manager_id]
    );

    // RBAC Sync: Create user_roles entry for new RBAC system
    try {
      const roleResult = await pool.query(
        'SELECT id FROM roles WHERE slug = $1',
        [validated.role]
      );

      if (roleResult.rows.length > 0) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (user_id, role_id) DO UPDATE SET
             is_active = TRUE,
             assigned_by = $3`,
          [newUser.id, roleResult.rows[0].id, currentUser.sub]
        );
      } else {
        console.warn(`RBAC: Role '${validated.role}' not found in roles table. User created without RBAC entry.`);
      }
    } catch (rbacError) {
      // Log RBAC error but don't fail user creation
      console.error('RBAC Sync Error during user creation:', rbacError);
      // User is created successfully, but RBAC sync failed
      // Admin can manually assign role via /api/permissions/users/:userId/roles
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
        area_manager_id: validated.area_manager_id,
        assistant_area_manager_id: validated.assistant_area_manager_id,
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
users.put('/:id', authMiddleware, auditMiddleware('user'), async (c) => {
  try {
    const currentUser = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = updateUserSchema.parse(body);

    // Users can only update their own profile unless they're admin
    if (currentUser.role !== 'admin' && currentUser.sub !== id) {
      throw new AuthorizationError('You can only update your own profile');
    }

   // Only admins can change roles and manager assignments
    if ((validated.role || validated.area_manager_id || validated.assistant_area_manager_id) && currentUser.role !== 'admin') {
      throw new AuthorizationError('Only admins can change roles and manager assignments');
    }

    // Role-based validation constraints
    if (validated.role === 'caravan' || CARAVAN_ROLES.includes(validated.role as any)) {
      if (!validated.area_manager_id && !validated.assistant_area_manager_id) {
        throw new ValidationError('Caravan requires an Area Manager or Assistant Area Manager assignment');
      }
    } else if (validated.role === 'tele') {
      // Tele users work independently and don't require manager assignments
      if (validated.area_manager_id || validated.assistant_area_manager_id) {
        throw new ValidationError('Tele users cannot have manager assignments');
      }
    } else if (validated.role === 'assistant_area_manager') {
      if (!validated.area_manager_id) {
        throw new ValidationError('Assistant Area Manager requires an Area Manager assignment');
      }
    } else if (validated.role === 'area_manager') {
      if (validated.area_manager_id || validated.assistant_area_manager_id) {
        throw new ValidationError('Area Manager cannot have manager assignments');
      }
    } else if (validated.role === 'admin') {
      // Admins should not have manager assignments
      if (validated.area_manager_id || validated.assistant_area_manager_id) {
        throw new ValidationError('Admin cannot have manager assignments');
      }
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
      area_manager_id: 'area_manager_id',
      assistant_area_manager_id: 'assistant_area_manager_id',
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

    // Update user_profiles if name, role, or manager assignments changed
    if (validated.first_name || validated.last_name || validated.role ||
        validated.area_manager_id !== undefined || validated.assistant_area_manager_id !== undefined) {
      try {
        await pool.query(
          `UPDATE user_profiles
           SET name = COALESCE($1, name),
               email = COALESCE($2, email),
               role = COALESCE($3, role),
               area_manager_id = COALESCE($4, area_manager_id),
               assistant_area_manager_id = COALESCE($5, assistant_area_manager_id)
           WHERE user_id = $6`,
          [
            validated.first_name && validated.last_name ?
              `${validated.first_name} ${validated.last_name}` : null,
            validated.email || null,
            validated.role || null,
            validated.area_manager_id !== undefined ? validated.area_manager_id : null,
            validated.assistant_area_manager_id !== undefined ? validated.assistant_area_manager_id : null,
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
        // Get the new role ID
        const newRoleResult = await pool.query(
          'SELECT id FROM roles WHERE slug = $1',
          [updatedUser.role]
        );

        if (newRoleResult.rows.length > 0) {
          const newRoleId = newRoleResult.rows[0].id;

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

          // Clear permission cache for this user
          if (id) {
            clearPermissionCache(id);
          }
        } else {
          console.warn(`RBAC: Role '${updatedUser.role}' not found in roles table.`);
        }
      } catch (rbacError) {
        // Log RBAC error but don't fail user update
        console.error('RBAC Sync Error during user update:', rbacError);
        // User is updated successfully, but RBAC sync failed
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

// DELETE /api/users/:id - Delete user (admin only)
users.delete('/:id', authMiddleware, auditMiddleware('user'), requireRole('admin'), async (c) => {
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
        ums.municipality_id,
        ums.assigned_at,
        ums.assigned_by,
        p.region,
        p.province,
        p.mun_city as municipality_name
       FROM user_locations ums
       LEFT JOIN psgc p ON TRIM(p.province) || '-' || TRIM(p.mun_city) = ums.municipality_id
       WHERE ums.user_id = $1 AND ums.deleted_at IS NULL
       ORDER BY ums.assigned_at DESC`,
      [userId]
    );

    // Map results to expected format
    const items = result.rows.map(row => ({
      id: row.id,
      municipality_id: row.municipality_id,
      municipality_name: row.municipality_name || row.municipality_id,
      municipality_code: row.municipality_id,
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
      municipality_ids: z.array(z.string()).min(1),
    });
    const validated = schema.parse(body);

    // Verify user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Verify all municipalities exist in PSGC table
    for (const municipalityId of validated.municipality_ids) {
      if (!municipalityId || !municipalityId.includes('-')) {
        throw new ValidationError(`Invalid municipality ID format: ${municipalityId}`);
      }

      const check = await pool.query(
        `SELECT 1 FROM psgc WHERE TRIM(province) || '-' || TRIM(mun_city) = $1 LIMIT 1`,
        [municipalityId]
      );

      if (check.rows.length === 0) {
        throw new NotFoundError(`Municipality not found: ${municipalityId}`);
      }
    }

    // Insert user assignments (upsert - handle re-assignments)
    let assignedCount = 0;
    for (const municipalityId of validated.municipality_ids) {
      const existing = await pool.query(
        'SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND municipality_id = $2',
        [userId, municipalityId]
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
          'INSERT INTO user_locations (id, user_id, municipality_id, assigned_at, assigned_by) VALUES (gen_random_uuid(), $1, $2, NOW(), $3)',
          [userId, municipalityId, currentUser.sub]
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
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Assign municipalities error:', error);
    throw new Error('Failed to assign municipalities');
  }
});

// POST /api/users/:id/municipalities/bulk - Bulk unassign municipalities (admin, area_manager, assistant_area_manager)
users.post('/:id/municipalities/bulk', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
  try {
    const userId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      municipality_ids: z.array(z.string()).min(1),
    });
    const validated = schema.parse(body);

    // Verify user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Bulk soft delete from user_locations using ANY()
    const result = await pool.query(
      `UPDATE user_locations
       SET deleted_at = NOW()
       WHERE user_id = $1
         AND TRIM(municipality_id) = ANY($2)
         AND deleted_at IS NULL
       RETURNING id`,
      [userId, validated.municipality_ids.map(m => m.trim())]
    );

    return c.json({
      message: `Bulk unassigned ${result.rows.length} municipalities`,
      deleted_count: result.rows.length,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk unassign municipalities error:', error);
    throw new Error('Failed to unassign municipalities');
  }
});

// DELETE /api/users/:id/municipalities/:municipalityId - Unassign municipality from user (admin, area_manager, assistant_area_manager)
users.delete('/:id/municipalities/:municipalityId', authMiddleware, requireAnyRole(...MANAGER_ROLES), async (c) => {
  try {
    const userId = c.req.param('id');
    const municipalityId = c.req.param('municipalityId');

    // Verify user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Remove from user (use TRIM to handle whitespace issues)
    const existing = await pool.query(
      'SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND TRIM(municipality_id) = TRIM($2)',
      [userId, municipalityId]
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

    return c.json({ message: 'Municipality unassigned successfully' });
  } catch (error) {
    console.error('Unassign municipality error:', error);
    throw new Error('Failed to unassign municipality');
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

// Bulk delete users
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

    const success: string[] = [];
    const failed: Array<{ id: string; error: string; code?: string }> = [];

    // Process each delete independently (no transaction wrapper)
    for (const id of ids) {
      try {
        const result = await pool.query(
          'DELETE FROM users WHERE id = $1 RETURNING id',
          [id]
        );

        if (result.rowCount === 0) {
          success.push(id); // Already deleted
        } else {
          success.push(id);
        }
      } catch (error: any) {
        // Check if foreign key constraint
        if (error.code === '23503') {
          failed.push({ id, error: 'Cannot delete user with dependent records', code: error.code });
        } else {
          failed.push({ id, error: 'Failed to delete user', code: error.code });
        }
      }
    }

    return c.json({ success, failed });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const validationError = new ValidationError('Invalid request body');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Bulk delete users error:', error);
    throw new Error('Failed to bulk delete users');
  }
});

export default users;
