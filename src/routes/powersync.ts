import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/index.js';
import jwt from 'jsonwebtoken';

const powersync = new Hono();

// Load PowerSync keys from environment
const POWERSYNC_PRIVATE_KEY = process.env.POWERSYNC_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
const POWERSYNC_PUBLIC_KEY = process.env.POWERSYNC_PUBLIC_KEY?.replace(/\\n/g, '\n').trim();
const POWERSYNC_KEY_ID = process.env.POWERSYNC_KEY_ID || 'imu-production-key';
const POWERSYNC_URL = process.env.POWERSYNC_URL || '';

// Check if PowerSync is properly configured
const isPowerSyncConfigured = POWERSYNC_PRIVATE_KEY &&
                                POWERSYNC_PRIVATE_KEY.includes('BEGIN PRIVATE KEY') &&
                                POWERSYNC_PUBLIC_KEY &&
                                POWERSYNC_PUBLIC_KEY.includes('BEGIN PUBLIC KEY') &&
                                POWERSYNC_URL &&
                                POWERSYNC_URL.length > 0;

/**
 * Generate PowerSync JWT token
 *
 * PowerSync requires RS256 JWT tokens with specific claims:
 * - sub: The user's unique identifier (REQUIRED by PowerSync)
 * - user_id: The user's unique identifier (for backwards compatibility)
 * - exp: Token expiration time
 * - iat: Token issued at time
 *
 * The token is signed with the PowerSync private key and verified
 * by the PowerSync service using the public key.
 */
powersync.get('/token', authMiddleware, async (c) => {
  const user = c.get('user');

  try {
    if (!isPowerSyncConfigured) {
      return c.json({
        success: false,
        error: 'PowerSync is not configured',
        message: 'PowerSync service is not available. Please contact administrator.',
      }, 503);
    }

    // PowerSync JWT payload
    const payload = {
      sub: user.sub, // PowerSync requires 'sub' claim
      user_id: user.sub, // Keep for backwards compatibility
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      iat: Math.floor(Date.now() / 1000),
      // Additional claims for debugging
      email: user.email || '',
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    };

    // Sign with RS256 algorithm using PowerSync private key
    const token = jwt.sign(payload, POWERSYNC_PRIVATE_KEY, {
      algorithm: 'RS256',
      keyid: POWERSYNC_KEY_ID,
    });

    return c.json({
      success: true,
      token,
      endpoint: POWERSYNC_URL,
      expiresAt: payload.exp * 1000, // Convert to milliseconds
      userId: user.sub,
    });
  } catch (error: any) {
    console.error('[PowerSync] Token generation error:', error);
    return c.json({
      success: false,
      error: 'Failed to generate PowerSync token',
      message: error?.message || 'Unknown error',
    }, 500);
  }
});

/**
 * Validate PowerSync configuration
 */
powersync.get('/status', authMiddleware, requirePermission('system', 'read'), async (c) => {
  return c.json({
    configured: isPowerSyncConfigured,
    endpoint: POWERSYNC_URL || null,
    keyId: POWERSYNC_KEY_ID || null,
    hasPrivateKey: !!POWERSYNC_PRIVATE_KEY?.includes('BEGIN PRIVATE KEY'),
    hasPublicKey: !!POWERSYNC_PUBLIC_KEY?.includes('BEGIN PUBLIC KEY'),
  });
});

export default powersync;
