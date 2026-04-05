import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/index.js';
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
} from '../errors/index.js';

const profile = new Hono();

const updateProfileSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  avatar_url: z.string().url().optional(),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

// GET /api/profile/:id - Get user profile
profile.get('/:id', authMiddleware, requirePermission('users', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    // Users can only view their own profile unless admin
    if (user.role === 'field_agent' && id !== user.sub) {
      throw new AuthorizationError('Unauthorized');
    }

    const result = await pool.query(
      `SELECT u.*, up.name as profile_name, up.avatar_url as profile_avatar_url,
              up.area_manager_id, up.assistant_area_manager_id
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const row = result.rows[0];
    return c.json({
      id: row.id,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      name: `${row.first_name} ${row.last_name}`,
      role: row.role,
      phone: row.phone,
      avatar_url: row.avatar_url || row.profile_avatar_url,
      area_manager_id: row.area_manager_id,
      assistant_area_manager_id: row.assistant_area_manager_id,
      created: row.created_at,
      updated: row.updated_at,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    throw new Error();
  }
});

// PUT /api/profile/:id - Update user profile
profile.put('/:id', authMiddleware, requirePermission('users', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = updateProfileSchema.parse(body);

    // Users can only update their own profile unless admin
    if (user.role === 'field_agent' && id !== user.sub) {
      throw new AuthorizationError('Unauthorized');
    }

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (validated.first_name !== undefined) {
      updateFields.push(`first_name = $${paramIndex++}`);
      updateValues.push(validated.first_name);
    }
    if (validated.last_name !== undefined) {
      updateFields.push(`last_name = $${paramIndex++}`);
      updateValues.push(validated.last_name);
    }
    if (validated.phone !== undefined) {
      updateFields.push(`phone = $${paramIndex++}`);
      updateValues.push(validated.phone);
    }
    if (validated.avatar_url !== undefined) {
      updateFields.push(`avatar_url = $${paramIndex++}`);
      updateValues.push(validated.avatar_url);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updateValues.push(id);
    const result = await pool.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    // Fetch user profile with manager fields
    const profileResult = await pool.query(
      `SELECT u.*, up.area_manager_id, up.assistant_area_manager_id
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`,
      [id]
    );

    const row = profileResult.rows[0];
    return c.json({
      id: row.id,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      name: `${row.first_name} ${row.last_name}`,
      role: row.role,
      phone: row.phone,
      avatar_url: row.avatar_url,
      area_manager_id: row.area_manager_id,
      assistant_area_manager_id: row.assistant_area_manager_id,
      updated: row.updated_at,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Update profile error:', error);
    throw new Error('Failed to update profile');
  }
});

// POST /api/profile/:id/avatar - Upload avatar image
profile.post('/:id/avatar', authMiddleware, requirePermission('users', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    // Users can only upload their own avatar unless admin
    if (user.role === 'field_agent' && id !== user.sub) {
      throw new AuthorizationError('Unauthorized');
    }

    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      throw new ValidationError('No file uploaded');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new ValidationError('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed');
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new ValidationError('File too large. Maximum size is 5MB');
    }

    // In production, you would upload to S3 or similar
    // For now, generate a placeholder URL
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`;

    // Update user avatar
    await pool.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2',
      [avatarUrl, id]
    );

    // Also update user_profiles if exists
    await pool.query(
      `INSERT INTO user_profiles (id, user_id, name, email, avatar_url)
       VALUES (gen_random_uuid(), $1, '', '', $2)
       ON CONFLICT (user_id) DO UPDATE SET avatar_url = $2`,
      [id, avatarUrl]
    );

    return c.json({
      message: 'Avatar uploaded successfully',
      avatar_url: avatarUrl,
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    throw new Error();
  }
});

// POST /api/profile/:id/change-password - Change password
profile.post('/:id/change-password', authMiddleware, requirePermission('users', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const validated = changePasswordSchema.parse(body);

    // Users can only change their own password
    if (id !== user.sub) {
      throw new AuthorizationError('Unauthorized');
    }

    // Verify current password
    const bcrypt = await import('bcrypt');
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const validPassword = await bcrypt.compare(validated.current_password, userResult.rows[0].password_hash);
    if (!validPassword) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(validated.new_password, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, id]
    );

    return c.json({ message: 'Password changed successfully' });
  } catch (error: any) {
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

export default profile;
