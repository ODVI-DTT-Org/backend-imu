import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../middleware/auth.js';
import { auditAuth } from '../middleware/audit.js';
import { emailService } from '../services/email.js';
import { pool } from '../db/index.js';
// Load PowerSync RSA private key for JWT signing
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const privateKeyPath = path.join(__dirname, '../../powersync-private-key.pem');
const publicKeyPath = path.join(__dirname, '../../powersync-public-key.pem');
let privateKey;
let publicKey;

// Load private key from env var or file
const envPrivateKey = process.env.POWERSYNC_PRIVATE_KEY;
console.log('🔍 DEBUG: POWERSYNC_PRIVATE_KEY env var exists:', !!envPrivateKey);
console.log('🔍 DEBUG: POWERSYNC_PRIVATE_KEY length:', envPrivateKey?.length || 0);
if (envPrivateKey && envPrivateKey.trim().length > 0) {
    // Handle escaped newlines in environment variable
    privateKey = envPrivateKey.trim().replace(/\\n/g, '\n');
    console.log('✅ PowerSync private key loaded from environment variable');
    // Validate the key format
    console.log('🔍 DEBUG: Private key starts with:', privateKey.substring(0, 20) + '...');
    console.log('🔍 DEBUG: Private key ends with:', '...' + privateKey.substring(privateKey.length - 20));
    console.log('🔍 DEBUG: Contains BEGIN PRIVATE KEY:', privateKey.includes('BEGIN PRIVATE KEY') || privateKey.includes('BEGIN RSA PRIVATE KEY'));
    console.log('🔍 DEBUG: Private key line count:', privateKey.split('\n').length);
}
else {
    console.log('⚠️ POWERSYNC_PRIVATE_KEY not set or empty, trying file...');
    try {
        privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
        console.log('✅ PowerSync private key loaded from file');
    }
    catch (error) {
        console.error('❌ Failed to load PowerSync private key:', error);
        throw new Error('PowerSync private key not found. Set POWERSYNC_PRIVATE_KEY env var or add file at ' + privateKeyPath);
    }
}

// Load public key from env var or file
const envPublicKey = process.env.POWERSYNC_PUBLIC_KEY;
console.log('🔍 DEBUG: POWERSYNC_PUBLIC_KEY env var exists (routes):', !!envPublicKey);
console.log('🔍 DEBUG: POWERSYNC_PUBLIC_KEY length:', envPublicKey?.length || 0);
if (envPublicKey && envPublicKey.trim().length > 0) {
    // Handle escaped newlines in environment variable
    publicKey = envPublicKey.trim().replace(/\\n/g, '\n');
    console.log('✅ PowerSync public key loaded from environment variable');
    console.log('🔍 DEBUG: Public key line count:', publicKey.split('\n').length);
}
else {
    console.log('⚠️ POWERSYNC_PUBLIC_KEY not set or empty, trying file...');
    try {
        publicKey = fs.readFileSync(publicKeyPath, 'utf-8');
        console.log('✅ PowerSync public key loaded from file');
    }
    catch (error) {
        console.warn('⚠️ Failed to load PowerSync public key, will use private key for verification');
        // Fallback to private key if public key is not available (not recommended for production)
        publicKey = privateKey;
    }
}
const { sign, verify } = jwt;
// Test RSA keys by attempting a simple sign/verify
console.log('🔑 TESTING RSA KEYS...');
try {
    const testPayload = { test: 'data', timestamp: Date.now() };
    const testToken = sign(testPayload, privateKey, { algorithm: 'RS256', keyid: 'test' });
    const testDecoded = verify(testToken, publicKey, { algorithms: ['RS256'] });
    console.log('✅ RSA keys validated successfully (sign/verify test passed)');
}
catch (error) {
    console.error('❌ RSA KEY VALIDATION FAILED:', error.message);
    console.error('   This means the private/public key pair is invalid or mismatched!');
    console.error('   privateKey type:', typeof privateKey);
    console.error('   privateKey length:', privateKey?.length);
    console.error('   publicKey type:', typeof publicKey);
    console.error('   publicKey length:', publicKey?.length);
    throw new Error('RSA key validation failed: ' + error.message);
}
const { hash, compare } = bcrypt;
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
// Login endpoint
auth.post('/login', async (c) => {
    try {
        const body = await c.req.json();
        const { email, password } = loginSchema.parse(body);

        // DEBUG: Log login attempt
        console.log('🔐 LOGIN ATTEMPT:', {
            email,
            timestamp: new Date().toISOString(),
            ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
        });

        // Find user by email
        const result = await pool.query('SELECT id, email, password_hash, first_name, last_name, role FROM users WHERE email = $1', [email]);

        console.log('🔍 DB QUERY RESULT:', {
            userFound: result.rows.length > 0,
            rowCount: result.rows.length,
            emailSearched: email
        });

        if (result.rows.length === 0) {
            console.log('❌ LOGIN FAILED: User not found');
            // Audit log failed login (no user found)
            // Note: We pass undefined for userId since no user exists
            // In production, you might want to log the email for security monitoring
            return c.json({ message: 'Invalid credentials' }, 401);
        }

        const user = result.rows[0];
        console.log('✅ USER FOUND:', {
            id: user.id,
            email: user.email,
            role: user.role,
            hasPasswordHash: !!user.password_hash,
            passwordHashLength: user.password_hash?.length || 0
        });

        // Verify password
        console.log('🔑 VERIFYING PASSWORD...');
        const valid = await compare(password, user.password_hash);

        console.log('🔑 PASSWORD VERIFICATION RESULT:', {
            valid,
            providedPasswordLength: password.length,
            storedHashStart: user.password_hash?.substring(0, 10) + '...'
        });

        if (!valid) {
            console.log('❌ LOGIN FAILED: Invalid password');
            // Audit log failed login
            await auditAuth.login(user.id, c.req.header('x-forwarded-for') || c.req.header('x-real-ip'), c.req.header('user-agent'), false);
            return c.json({ message: 'Invalid credentials' }, 401);
        }
        // Generate tokens
        const expiryHours = parseInt(process.env.JWT_EXPIRY_HOURS || '24');
        console.log('🎫 GENERATING TOKENS:', { expiryHours });

        const accessToken = sign({
            sub: user.id,
            iss: 'imu-backend',
            aud: 'https://imu-api.cfbtools.app', // Backend API URL
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
        }, privateKey, {
            algorithm: 'RS256',
            keyid: 'imu-production-key-20260401',
            expiresIn: `${expiryHours}h`,
        });
        const refreshToken = sign({
            sub: user.id,
            iss: 'imu-backend',
            aud: 'https://imu-api.cfbtools.app', // Backend API URL
            type: 'refresh',
        }, privateKey, {
            algorithm: 'RS256',
            keyid: 'imu-production-key-20260401',
            expiresIn: '7d',
        });

        console.log('✅ LOGIN SUCCESSFUL:', {
            userId: user.id,
            email: user.email,
            role: user.role,
            accessTokenGenerated: !!accessToken,
            refreshTokenGenerated: !!refreshToken
        });

        // Audit log successful login
        await auditAuth.login(user.id, c.req.header('x-forwarded-for') || c.req.header('x-real-ip'), c.req.header('user-agent'), true);

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
    }
    catch (error) {
        console.error('❌ LOGIN ERROR:', {
            error: error.message,
            stack: error.stack,
            name: error.name
        });
        if (error instanceof z.ZodError) {
            console.log('❌ VALIDATION ERROR:', error.errors);
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Login error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// Refresh token endpoint
auth.post('/refresh', async (c) => {
    try {
        const body = await c.req.json();
        const { refresh_token } = refreshSchema.parse(body);
        // Verify refresh token - try RS256 first (new tokens), then HS256 (old tokens for backward compatibility)
        let decoded;
        try {
            // Try verifying with new RS256 public key
            decoded = verify(refresh_token, publicKey, { algorithms: ['RS256'] });
        }
        catch (rs256Error) {
            try {
                // Fall back to old HS256 with JWT_SECRET for backward compatibility
                const jwtSecret = process.env.JWT_SECRET;
                decoded = verify(refresh_token, jwtSecret, { algorithms: ['HS256'] });
                console.log('⚠️ Verified old HS256 token - user will get new RS256 tokens');
            }
            catch (hs256Error) {
                throw new Error('Invalid token: neither RS256 nor HS256 verification succeeded');
            }
        }
        if (decoded.type !== 'refresh') {
            return c.json({ message: 'Invalid token type' }, 401);
        }
        // Get user from database
        const result = await pool.query('SELECT id, email, first_name, last_name, role FROM users WHERE id = $1', [decoded.sub]);
        if (result.rows.length === 0) {
            return c.json({ message: 'User not found' }, 401);
        }
        const user = result.rows[0];
        const expiryHours = parseInt(process.env.JWT_EXPIRY_HOURS || '24');
        // Generate new access token
        const accessToken = sign({
            sub: user.id,
            iss: 'imu-backend',
            aud: 'https://imu-api.cfbtools.app', // Backend API URL
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
        }, privateKey, {
            algorithm: 'RS256',
            keyid: 'imu-production-key-20260401',
            expiresIn: `${expiryHours}h`,
        });
        // Generate new refresh token
        const newRefreshToken = sign({
            sub: user.id,
            iss: 'imu-backend',
            aud: 'https://imu-api.cfbtools.app', // Backend API URL
            type: 'refresh',
        }, privateKey, {
            algorithm: 'RS256',
            keyid: 'imu-production-key-20260401',
            expiresIn: '7d',
        });
        return c.json({
            access_token: accessToken,
            refresh_token: newRefreshToken,
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Refresh error:', error);
        return c.json({ message: 'Invalid refresh token' }, 401);
    }
});
// Get current user profile
auth.get('/me', authMiddleware, async (c) => {
    const user = c.get('user');
    try {
        const result = await pool.query('SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1', [user.sub]);
        if (result.rows.length === 0) {
            return c.json({ message: 'User not found' }, 404);
        }
        return c.json({ user: result.rows[0] });
    }
    catch (error) {
        console.error('Get user error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// Register endpoint (for testing/development)
auth.post('/register', async (c) => {
    try {
        const body = await c.req.json();
        const { email, password, first_name, last_name, role = 'field_agent' } = body;
        // Hash password
        const password_hash = await hash(password, 10);
        // Insert user
        const result = await pool.query(`INSERT INTO users (id, email, password_hash, first_name, last_name, role)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING id, email, first_name, last_name, role`, [email, password_hash, first_name, last_name, role]);
        return c.json({ user: result.rows[0] }, 201);
    }
    catch (error) {
        if (error.code === '23505') {
            return c.json({ message: 'Email already exists' }, 409);
        }
        console.error('Register error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// Forgot password - Request password reset
auth.post('/forgot-password', async (c) => {
    try {
        const body = await c.req.json();
        const { email } = forgotPasswordSchema.parse(body);
        // Find user by email
        const result = await pool.query('SELECT id, email, first_name FROM users WHERE email = $1', [email]);
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
        await pool.query(`INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET token_hash = $2, expires_at = $3, created_at = NOW()`, [user.id, resetTokenHash, expiresAt]);
        // In production, send email with reset link
        // For development, return the token (remove in production!)
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4002'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
        // Send password reset email
        const emailResult = await emailService.sendPasswordReset(email, resetUrl, `${user.first_name}`);
        if (!emailResult.success) {
            console.error('Failed to send password reset email:', emailResult.error);
        }
        return c.json({
            message: 'If the email exists, a reset link has been sent',
            // Remove in production:
            _dev_reset_url: process.env.NODE_ENV === 'development' ? resetUrl : undefined
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Forgot password error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// Reset password - Complete password reset with token
auth.post('/reset-password', async (c) => {
    try {
        const body = await c.req.json();
        const { token, password } = resetPasswordSchema.parse(body);
        // Find valid reset token (not expired)
        const tokenResult = await pool.query(`SELECT prt.*, u.email FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.expires_at > NOW()
       ORDER BY prt.created_at DESC
       LIMIT 10`);
        if (tokenResult.rows.length === 0) {
            return c.json({ message: 'Invalid or expired reset token' }, 400);
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
            return c.json({ message: 'Invalid reset token' }, 400);
        }
        // Hash new password
        const newPasswordHash = await hash(password, 10);
        // Update user password
        await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newPasswordHash, resetRecord.user_id]);
        // Audit log password reset
        await auditAuth.passwordReset(resetRecord.user_id, c.req.header('x-forwarded-for') || c.req.header('x-real-ip'));
        // Delete used reset token
        await pool.query('DELETE FROM password_reset_tokens WHERE id = $1', [resetRecord.id]);
        return c.json({ message: 'Password has been reset successfully' });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid input', errors: error.errors }, 400);
        }
        console.error('Reset password error:', error);
        return c.json({ message: 'Internal server error' }, 500);
    }
});
// Logout endpoint (client-side token removal, but we invalidate reset tokens too)
auth.post('/logout', async (c) => {
    try {
        const authHeader = c.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return c.json({ message: 'Logged out' });
        }
        const token = authHeader.substring(7);
        try {
            // Try verifying with new RS256 public key first
            let decoded = null;
            try {
                decoded = verify(token, publicKey, { algorithms: ['RS256'] });
            }
            catch {
                // Fall back to old HS256 with JWT_SECRET for backward compatibility
                try {
                    const jwtSecret = process.env.JWT_SECRET;
                    decoded = verify(token, jwtSecret, { algorithms: ['HS256'] });
                }
                catch {
                    // Token invalid, but that's fine for logout
                }
            }
            if (decoded) {
                // Audit log logout
                await auditAuth.logout(decoded.sub, c.req.header('x-forwarded-for') || c.req.header('x-real-ip'), c.req.header('user-agent'));
                // Invalidate any password reset tokens for this user
                await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [decoded.sub]);
            }
        }
        catch {
            // Token invalid, but that's fine for logout
        }
        return c.json({ message: 'Logged out successfully' });
    }
    catch {
        return c.json({ message: 'Logged out' });
    }
});
export default auth;
