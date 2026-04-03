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
} from '../errors/index.js';
import { setPermissionsCookie, clearPermissionsCookie, getUserPermissionsAsString } from '../middleware/permissions.js';
import { setCookie } from '../utils/cookie.js';
import { authRateLimit } from '../middleware/rate-limit.js';

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

console.log('✅ PowerSync keys loaded from environment');

const { sign, verify } = jwt;
const { hash, compare } = bcryptjs;

const auth = new Hono();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const refreshSchema = z.object({
  refresh_token: z.string(),
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

  // Generate tokens
  const expiryHours = parseInt(process.env.JWT_EXPIRY_HOURS || '24');

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

  const refreshToken = sign(
    {
      sub: user.id,
      aud: powerSyncUrl,
      type: 'refresh',
    },
    signingKey,
    {
      algorithm: 'RS256',
      keyid: 'imu-production-key-20260326',
      expiresIn: '1d',
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
      const [resource, actionPart] = p.split('.');
      const [action, constraint] = actionPart.split(':');
      return {
        resource,
        action,
        constraint_name: constraint,
        role_slug: user.role,
      };
    }),
    { sub: user.id, role: user.role }
  );
  setCookie(c, cookie);

  return c.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    },
  });
});

// Refresh token endpoint
auth.post('/refresh', async (c) => {
  try {
    const body = await c.req.json();
    const { refresh_token } = refreshSchema.parse(body);

    // Verify refresh token - try RS256 first (new tokens), then HS256 (old tokens for backward compatibility)
    let decoded: { sub: string; type: string };
    try {
      // Try verifying with new RS256 public key
      decoded = verify(refresh_token, verificationKey, { algorithms: ['RS256'] }) as { sub: string; type: string };
    } catch (rs256Error) {
      try {
        // Fall back to old HS256 with JWT_SECRET for backward compatibility
        const jwtSecret = process.env.JWT_SECRET!;
        decoded = verify(refresh_token, jwtSecret, { algorithms: ['HS256'] }) as { sub: string; type: string };
        console.log('⚠️ Verified old HS256 token - user will get new RS256 tokens');
      } catch (hs256Error) {
        throw new Error('Invalid token: neither RS256 nor HS256 verification succeeded');
      }
    }

    if (decoded.type !== 'refresh') {
      throw new TokenInvalidError('Invalid token type');
    }

    // Get user from database
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role FROM users WHERE id = $1',
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const user = result.rows[0];
    const expiryHours = parseInt(process.env.JWT_EXPIRY_HOURS || '24');

    // Get fresh permissions and update cookie
    const permissions = await getUserPermissionsAsString(user.id, user.role);
    const cookie = setPermissionsCookie(
      permissions.map((p) => {
        const [resource, actionPart] = p.split('.');
        const [action, constraint] = actionPart.split(':');
        return {
          resource,
          action,
          constraint_name: constraint,
          role_slug: user.role,
        };
      }),
      { sub: user.id, role: user.role }
    );
    setCookie(c, cookie);

    // Generate new access token
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

    // Generate new refresh token
    const newRefreshToken = sign(
      {
        sub: user.id,
        aud: powerSyncUrl,
        type: 'refresh',
      },
      signingKey,
      {
        algorithm: 'RS256',
        keyid: 'imu-production-key-20260326',
        expiresIn: '1d',
      }
    );

    return c.json({
      access_token: accessToken,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Refresh error:', error);
    throw new TokenInvalidError('Invalid refresh token');
  }
});

// Get current user profile
auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');

  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1',
      [user.sub]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    return c.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

// Register endpoint (for testing/development)
auth.post('/register', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, first_name, last_name, role = 'field_agent' } = body;

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
    if (error.code === '23505') {
      return c.json({ message: 'Email already exists' }, 409);
    }
    console.error('Register error:', error);
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
      console.error('Failed to send password reset email:', emailResult.error);
    }

    return c.json({
      message: 'If the email exists, a reset link has been sent',
      // Remove in production:
      _dev_reset_url: process.env.NODE_ENV === 'development' ? resetUrl : undefined
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Forgot password error:', error);
    throw new Error('Internal server error');
  }
});

// Reset password - Complete password reset with token
auth.post('/reset-password', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const { token, password } = resetPasswordSchema.parse(body);

    // Find valid reset token (not expired)
    const tokenResult = await pool.query(
      `SELECT prt.*, u.email FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.expires_at > NOW()
       ORDER BY prt.created_at DESC
       LIMIT 10`
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    console.error('Reset password error:', error);
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
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return c.json({ success: false, message: 'Failed to fetch permissions' }, 500);
  }
});

export default auth;
