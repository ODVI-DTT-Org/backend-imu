import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import { auditAuth } from '../middleware/audit.js';
import { emailService } from '../services/email.js';
import { pool } from '../db/index.js';
import {
  InvalidCredentialsError,
  TokenExpiredError,
  TokenInvalidError,
  ValidationError,
  NotFoundError,
  AppError,
  AuthenticationError,
} from '../errors/index.js';
import { setPermissionsCookie, clearPermissionsCookie, getUserPermissionsAsString } from '../middleware/permissions.js';
import { setCookie } from '../utils/cookie.js';
import { authRateLimit } from '../middleware/rate-limit.js';
import { logger } from '../utils/logger.js';

// Load PowerSync RSA keys from environment variable for JWT signing
const privateKeyInput = process.env.POWERSYNC_PRIVATE_KEY;
const publicKeyInput = process.env.POWERSYNC_PUBLIC_KEY;
const powerSyncUrl = process.env.POWERSYNC_URL || 'http://localhost:8080';

if (!privateKeyInput) {
  throw new Error('POWERSYNC_PRIVATE_KEY environment variable is required for JWT signing');
}

// Handle escaped newlines in environment variables (DigitalOcean format)
const privateKey = privateKeyInput.trim().replace(/\\n/g, '\n');
const publicKey = (publicKeyInput || privateKeyInput).trim().replace(/\\n/g, '\n');

// Type assertions for TypeScript (runtime check above ensures these are defined)
const signingKey = privateKey as string;
const verificationKey = publicKey as string;

// Removed verbose startup log - now handled by init-logger

const { sign, verify } = jwt;
const { hash, compare } = bcryptjs;

const auth = new Hono();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  role: z.enum(['admin', 'area_manager', 'assistant_area_manager', 'caravan', 'tele', 'team_leader']).optional().default('caravan'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

// Login endpoint (with rate limiting)
auth.post('/login', authRateLimit, async (c) => {
  // Parse request body
  const body = await c.req.json();
  const { email, password } = loginSchema.parse(body);

  // Find user by email
  const result = await pool.query(
    'SELECT id, email, password_hash, first_name, last_name, role FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    throw new InvalidCredentialsError();
  }

  const user = result.rows[0];

  // Verify password
  const valid = await compare(password, user.password_hash);
  if (!valid) {
    // Audit log failed login
    await auditAuth.login(
      user.id,
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      c.req.header('user-agent'),
      false
    );
    throw new InvalidCredentialsError();
  }

  // Generate access token (30 days = 720 hours)
  const expiryHours = parseInt(process.env.JWT_EXPIRY_HOURS || '720');

  const accessToken = sign(
    {
      sub: user.id,
      aud: powerSyncUrl,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    },
    signingKey,
    {
      algorithm: 'RS256',
      keyid: 'imu-production-key-20260326',
      expiresIn: `${expiryHours}h`,
    }
  );

  // Generate refresh token (365 days)
  const refreshToken = sign(
    {
      sub: user.id,
      type: 'refresh',
    },
    signingKey,
    {
      algorithm: 'RS256',
      keyid: 'imu-production-key-20260326',
      expiresIn: '365d',
    }
  );

  // Audit log successful login
  await auditAuth.login(
    user.id,
    c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    c.req.header('user-agent'),
    true
  );

  // Get user permissions and set cookie
  const permissions = await getUserPermissionsAsString(user.id, user.role);
  const cookie = setPermissionsCookie(
    // Convert string[] to Permission[] format for cookie function
    permissions.map((p) => {
      // Handle wildcard permission for admin users
      if (p === '*') {
        return {
          resource: '*',
          action: '*',
          constraint_name: undefined,
          role_slug: user.role,
        };
      }

      // Parse standard permission format: resource.action or resource.action:constraint
      const [resource, actionPart] = p.split('.');
      if (!actionPart) {
        // Invalid permission format, skip this permission
        logger.warn('auth/login', `Invalid permission format: ${p}`);
        return null;
      }

      const [action, constraint] = actionPart.split(':');
      return {
        resource,
        action,
        constraint_name: constraint || undefined,
        role_slug: user.role,
      };
    }).filter((p): p is Exclude<typeof p, null> => p !== null), // Filter out null values
    { sub: user.id, role: user.role }
  );
  setCookie(c, cookie);

  return c.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiryHours * 3600,
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    },
  });
});

// Get current user profile
auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');

  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, theme_color, theme_mode, created_at FROM users WHERE id = $1',
      [user.sub]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    return c.json({ user: result.rows[0] });
  } catch (error: any) {
    logger.error('auth/me', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// Register endpoint (admin only in practice — protected at the infrastructure level)
auth.post('/register', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, first_name, last_name, role } = registerSchema.parse(body);

    // Hash password
    const password_hash = await hash(password, 10);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING id, email, first_name, last_name, role`,
      [email, password_hash, first_name, last_name, role]
    );

    return c.json({ user: result.rows[0] }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    if (error.code === '23505') {
      return c.json({ message: 'Email already exists' }, 409);
    }
    logger.error('auth/register', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// Forgot password - Request password reset
auth.post('/forgot-password', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const { email } = forgotPasswordSchema.parse(body);

    // Find user by email
    const result = await pool.query(
      'SELECT id, email, first_name FROM users WHERE email = $1',
      [email]
    );

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return c.json({ message: 'If the email exists, a reset link has been sent' });
    }

    const user = result.rows[0];

    // Generate reset token (random 32 bytes, hex encoded)
    const resetToken = randomBytes(32).toString('hex');
    const resetTokenHash = await hash(resetToken, 10);
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in database
    await pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET token_hash = $2, expires_at = $3, created_at = NOW()`,
      [user.id, resetTokenHash, expiresAt]
    );

    // In production, send email with reset link
    // For development, return the token (remove in production!)
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4002'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    // Send password reset email
    const emailResult = await emailService.sendPasswordReset(
      email,
      resetUrl,
      `${user.first_name}`
    );

    if (!emailResult.success) {
      logger.error('auth/forgot-password', 'Failed to send password reset email', { error: String(emailResult.error) });
    }

    return c.json({
      message: 'If the email exists, a reset link has been sent',
      // Remove in production:
      _dev_reset_url: process.env.NODE_ENV === 'development' ? resetUrl : undefined
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    logger.error('auth/forgot-password', error);
    throw new Error('Internal server error');
  }
});

// Reset password - Complete password reset with token
auth.post('/reset-password', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const { token, password } = resetPasswordSchema.parse(body);

    // Find valid reset tokens (not expired). ON CONFLICT (user_id) ensures at most
    // one token per user, but use a generous limit to avoid missing tokens.
    const tokenResult = await pool.query(
      `SELECT prt.*, u.email FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.expires_at > NOW()
       ORDER BY prt.created_at DESC
       LIMIT 500`
    );

    if (tokenResult.rows.length === 0) {
      throw new TokenExpiredError('Invalid or expired reset token');
    }

    // Find matching token
    let resetRecord = null;
    for (const record of tokenResult.rows) {
      const validToken = await compare(token, record.token_hash);
      if (validToken) {
        resetRecord = record;
        break;
      }
    }

    if (!resetRecord) {
      throw new TokenInvalidError('Invalid reset token');
    }

    // Hash new password
    const newPasswordHash = await hash(password, 10);

    // Update user password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, resetRecord.user_id]
    );

    // Audit log password reset
    await auditAuth.passwordReset(
      resetRecord.user_id,
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip')
    );

    // Delete used reset token
    await pool.query('DELETE FROM password_reset_tokens WHERE id = $1', [resetRecord.id]);

    return c.json({ message: 'Password has been reset successfully' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    logger.error('auth/reset-password', error);
    throw new Error('Internal server error');
  }
});

// Change password for authenticated user
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

auth.post('/change-password', authRateLimit, authMiddleware, async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [user.sub]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const valid = await compare(currentPassword, result.rows[0].password_hash);
    if (!valid) {
      throw new InvalidCredentialsError('Current password is incorrect');
    }

    const newHash = await hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, user.sub]
    );

    await auditAuth.passwordReset(
      user.sub,
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip')
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
    throw error;
  }
});

// Request password reset (admin-notification flow for mobile users)
const requestPasswordResetSchema = z.object({
  username: z.string().min(1),
});

auth.post('/request-password-reset', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const { username } = requestPasswordResetSchema.parse(body);

    // Look up user by email (username field accepts email)
    const result = await pool.query(
      `SELECT id, email, first_name, last_name FROM users WHERE email = $1 OR LOWER(CONCAT(first_name, ' ', last_name)) = LOWER($1)`,
      [username]
    );

    // Find any admin users to notify
    const admins = await pool.query(
      "SELECT email, first_name FROM users WHERE role = 'admin' LIMIT 5"
    );

    const requesterName = result.rows.length > 0
      ? `${result.rows[0].first_name} ${result.rows[0].last_name} (${result.rows[0].email})`
      : username;

    // Store the request in the database
    const userId = result.rows.length > 0 ? result.rows[0].id : null;
    await pool.query(
      `INSERT INTO password_reset_requests (user_id, username_submitted) VALUES ($1, $2)`,
      [userId, username]
    );

    // Notify all admins via email (fire-and-forget)
    if (admins.rows.length > 0) {
      const adminUrl = `${process.env.FRONTEND_URL || 'http://localhost:4002'}/users`;
      for (const admin of admins.rows) {
        emailService.send({
          to: admin.email,
          subject: 'Password Reset Request – IMU',
          html: `<p>Hi ${admin.first_name},</p><p>User <strong>${requesterName}</strong> has requested a password reset via the mobile app. Please reset their password and notify them.</p><p><a href="${adminUrl}">Go to Users</a></p>`,
          text: `User ${requesterName} has requested a password reset. Please reset their password and notify them. Users page: ${adminUrl}`,
        }).catch((err: any) => {
          logger.error('auth/request-password-reset', 'Failed to send admin notification', { error: String(err) });
        });
      }
    } else {
      logger.warn('auth/request-password-reset', 'No admin users found to notify for password reset request', { requester: requesterName });
    }

    return c.json({ message: 'Your request has been submitted. An admin will contact you shortly.' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    logger.error('auth/request-password-reset', error);
    throw new Error('Internal server error');
  }
});

// Logout endpoint (client-side token removal, but we invalidate reset tokens too)
auth.post('/logout', async (c) => {
  try {
    // Clear permissions cookie
    const cookie = clearPermissionsCookie();
    setCookie(c, cookie);

    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ message: 'Logged out' });
    }

    const token = authHeader.substring(7);

    try {
      // Try verifying with new RS256 public key first
      let decoded: { sub: string } | null = null;
      try {
        decoded = verify(token, verificationKey, { algorithms: ['RS256'] }) as { sub: string };
      } catch {
        // Fall back to old HS256 with JWT_SECRET for backward compatibility
        try {
          const jwtSecret = process.env.JWT_SECRET!;
          decoded = verify(token, jwtSecret, { algorithms: ['HS256'] }) as { sub: string };
        } catch {
          // Token invalid, but that's fine for logout
        }
      }

      if (decoded) {
        // Audit log logout
        await auditAuth.logout(
          decoded.sub,
          c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
          c.req.header('user-agent')
        );

        // Invalidate any password reset tokens for this user
        await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [decoded.sub]);
      }
    } catch {
      // Token invalid, but that's fine for logout
    }

    return c.json({ message: 'Logged out successfully' });
  } catch {
    return c.json({ message: 'Logged out' });
  }
});

// Token refresh endpoint for mobile app
auth.post('/refresh', async (c) => {
  const body = await c.req.json();
  const { refresh_token } = body;

  if (!refresh_token) {
    throw new TokenInvalidError();
  }

  let decoded: { sub: string; type?: string } | null = null;
  try {
    decoded = verify(refresh_token, verificationKey, { algorithms: ['RS256'] }) as { sub: string; type?: string };
  } catch {
    throw new TokenInvalidError();
  }

  if (decoded.type !== 'refresh') {
    throw new TokenInvalidError();
  }

  const result = await pool.query(
    'SELECT id, email, first_name, last_name, role FROM users WHERE id = $1',
    [decoded.sub]
  );

  if (result.rows.length === 0) {
    throw new TokenInvalidError();
  }

  const user = result.rows[0];
  const expiryHours = parseInt(process.env.JWT_EXPIRY_HOURS || '720');

  const accessToken = sign(
    {
      sub: user.id,
      aud: powerSyncUrl,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    },
    signingKey,
    {
      algorithm: 'RS256',
      keyid: 'imu-production-key-20260326',
      expiresIn: `${expiryHours}h`,
    }
  );

  const newRefreshToken = sign(
    { sub: user.id, type: 'refresh' },
    signingKey,
    { algorithm: 'RS256', keyid: 'imu-production-key-20260326', expiresIn: '365d' }
  );

  return c.json({
    access_token: accessToken,
    refresh_token: newRefreshToken,
    expires_in: expiryHours * 3600,
  });
});

// Get permissions endpoint for mobile app
auth.get('/permissions', authMiddleware, async (c) => {
  try {
    const user = c.get('user');

    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    // Fetch user permissions from database
    const result = await pool.query(
      `SELECT
        upv.resource,
        upv.action,
        upv.constraint_name,
        upv.role_slug
      FROM user_permissions_view upv
      WHERE upv.user_id = $1
      ORDER BY upv.resource, upv.action`,
      [user.sub]
    );

    // Return in format expected by mobile app
    return c.json({
      success: true,
      permissions: result.rows,
    });
  } catch (error: any) {
    logger.error('auth/permissions', error);
    return c.json({ success: false, message: 'Failed to fetch permissions' }, 500);
  }
});

// List password reset requests (admin only)
auth.get('/reset-requests', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ message: 'Forbidden' }, 403);
  }

  try {
    const status = c.req.query('status') || 'pending';
    const result = await pool.query(
      `SELECT
         prr.id,
         prr.username_submitted,
         prr.status,
         prr.created_at,
         prr.completed_at,
         u.id        AS user_id,
         u.first_name,
         u.last_name,
         u.email,
         u.role,
         cb.first_name AS completed_by_first_name,
         cb.last_name  AS completed_by_last_name
       FROM password_reset_requests prr
       LEFT JOIN users u  ON u.id  = prr.user_id
       LEFT JOIN users cb ON cb.id = prr.completed_by
       WHERE prr.status = $1
       ORDER BY prr.created_at DESC
       LIMIT 100`,
      [status]
    );

    return c.json({ requests: result.rows });
  } catch (error: any) {
    logger.error('auth/reset-requests', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// Update a password reset request status (admin only)
const updateResetRequestSchema = z.object({
  status: z.enum(['completed', 'dismissed']),
});

auth.patch('/reset-requests/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ message: 'Forbidden' }, 403);
  }

  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { status } = updateResetRequestSchema.parse(body);

    const result = await pool.query(
      `UPDATE password_reset_requests
       SET status = $1, completed_at = NOW(), completed_by = $2
       WHERE id = $3
       RETURNING id, status`,
      [status, user.sub, id]
    );

    if (result.rows.length === 0) {
      return c.json({ message: 'Request not found' }, 404);
    }

    return c.json({ request: result.rows[0] });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    logger.error('auth/reset-requests/:id', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default auth;
