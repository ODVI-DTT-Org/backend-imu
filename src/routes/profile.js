import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/index.js';
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
profile.get('/:id', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        // Users can only view their own profile unless admin
        if (user.role === 'field_agent' && id !== user.sub) {
            return c.json({ message: 'Unauthorized' }, 403);
        }
        const result = await pool.query(`SELECT u.*, up.name as profile_name, up.avatar_url
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`, [id]);
        if (result.rows.length === 0) {
            return c.json({ message: 'User not found' }, 404);
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
            created: row.created_at,
            updated: row.updated_at,
        });
    }
    catch (error) {
        console.error('Get profile error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// PUT /api/profile/:id - Update user profile
profile.put('/:id', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        const body = await c.req.json();
        const validated = updateProfileSchema.parse(body);
        // Users can only update their own profile unless admin
        if (user.role === 'field_agent' && id !== user.sub) {
            return c.json({ message: 'Unauthorized' }, 403);
        }
        const updateFields = [];
        const updateValues = [];
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
            return c.json({ message: 'No fields to update' }, 400);
        }
        updateValues.push(id);
        const result = await pool.query(`UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`, updateValues);
        if (result.rows.length === 0) {
            return c.json({ message: 'User not found' }, 404);
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
            avatar_url: row.avatar_url,
            updated: row.updated_at,
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Update profile error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// POST /api/profile/:id/avatar - Upload avatar image
profile.post('/:id/avatar', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        // Users can only upload their own avatar unless admin
        if (user.role === 'field_agent' && id !== user.sub) {
            return c.json({ message: 'Unauthorized' }, 403);
        }
        const body = await c.req.parseBody();
        const file = body['file'];
        if (!file || !(file instanceof File)) {
            return c.json({ message: 'No file uploaded' }, 400);
        }
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            return c.json({ message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed' }, 400);
        }
        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            return c.json({ message: 'File too large. Maximum size is 5MB' }, 400);
        }
        // In production, you would upload to S3 or similar
        // For now, generate a placeholder URL
        const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`;
        // Update user avatar
        await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, id]);
        // Also update user_profiles if exists
        await pool.query(`INSERT INTO user_profiles (id, user_id, name, email, avatar_url)
       VALUES (gen_random_uuid(), $1, '', '', $2)
       ON CONFLICT (user_id) DO UPDATE SET avatar_url = $2`, [id, avatarUrl]);
        return c.json({
            message: 'Avatar uploaded successfully',
            avatar_url: avatarUrl,
        });
    }
    catch (error) {
        console.error('Upload avatar error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// POST /api/profile/:id/change-password - Change password
profile.post('/:id/change-password', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        const body = await c.req.json();
        const validated = changePasswordSchema.parse(body);
        // Users can only change their own password
        if (id !== user.sub) {
            return c.json({ message: 'Unauthorized' }, 403);
        }
        // Verify current password
        const bcrypt = await import('bcrypt');
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) {
            return c.json({ message: 'User not found' }, 404);
        }
        const validPassword = await bcrypt.compare(validated.current_password, userResult.rows[0].password_hash);
        if (!validPassword) {
            return c.json({ message: 'Current password is incorrect' }, 400);
        }
        // Hash new password
        const newPasswordHash = await bcrypt.hash(validated.new_password, 10);
        // Update password
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, id]);
        return c.json({ message: 'Password changed successfully' });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Change password error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
export default profile;
