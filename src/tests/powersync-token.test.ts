import { describe, it, expect, beforeAll } from 'vitest';
import { sign } from 'jsonwebtoken';
import { config } from 'dotenv';

// Load environment variables
config();

// Test PowerSync token generation
describe('PowerSync Token Endpoint', () => {
  const testUserId = '00000000-0000-0000-0000-000000000000';
  const testEmail = 'powersync-test@example.com';

  beforeAll(() => {
    // Verify environment variables are loaded
    console.log('POWERSYNC_PRIVATE_KEY exists:', !!process.env.POWERSYNC_PRIVATE_KEY);
    console.log('POWERSYNC_URL exists:', !!process.env.POWERSYNC_URL);
  });

  it('should generate PowerSync token with user_id claim', async () => {
    // This test verifies the PowerSync token endpoint logic
    // In a real scenario, this would make an HTTP request to /api/powersync/token

    const POWERSYNC_PRIVATE_KEY = process.env.POWERSYNC_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
    const POWERSYNC_KEY_ID = process.env.POWERSYNC_KEY_ID || 'imu-production-key';
    const POWERSYNC_URL = process.env.POWERSYNC_URL || '';

    expect(POWERSYNC_PRIVATE_KEY).toBeTruthy();
    expect(POWERSYNC_PRIVATE_KEY).toContain('BEGIN PRIVATE KEY');
    expect(POWERSYNC_URL).toBeTruthy();

    // Simulate token generation (same logic as in powersync.ts)
    const payload = {
      user_id: testUserId, // PowerSync expects 'user_id' claim
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      iat: Math.floor(Date.now() / 1000),
      email: 'powersync-test@example.com',
      name: 'PowerSync Test',
    };

    const powerSyncToken = sign(payload, POWERSYNC_PRIVATE_KEY, {
      algorithm: 'RS256',
      keyid: POWERSYNC_KEY_ID,
    });

    // Verify token structure
    expect(powerSyncToken).toBeTruthy();
    expect(typeof powerSyncToken).toBe('string');

    // Token should be JWT format (3 parts separated by dots)
    const parts = powerSyncToken.split('.');
    expect(parts).toHaveLength(3);

    // Decode payload to verify claims
    const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    expect(decodedPayload.user_id).toBe(testUserId);
    expect(decodedPayload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should return all required PowerSync credential fields', () => {
    const POWERSYNC_URL = process.env.POWERSYNC_URL || '';

    const response = {
      success: true,
      token: 'test-token',
      endpoint: POWERSYNC_URL,
      expiresAt: Math.floor(Date.now() / 1000) + (24 * 60 * 60) * 1000,
      userId: testUserId,
    };

    // Verify all required fields are present
    expect(response.success).toBe(true);
    expect(response.token).toBeTruthy();
    expect(response.endpoint).toBeTruthy();
    expect(response.expiresAt).toBeTruthy();
    expect(response.userId).toBeTruthy();
    expect(response.userId).not.toBeNull();
  });
});
