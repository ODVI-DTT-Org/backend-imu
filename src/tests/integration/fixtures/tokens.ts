// src/tests/integration/fixtures/tokens.ts

import jwt from 'jsonwebtoken';

// Use a fixed secret for testing (matches .env.example)
const TEST_JWT_SECRET = 'your-256-bit-secret-key-here-min-32-characters';

interface TokenPayload {
  sub: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
}

/**
 * Generate a valid JWT token for testing
 * @param payload - Token payload (user info)
 * @param expiresIn - Token expiry (default: '1h')
 * @returns Signed JWT token
 */
export function generateTestToken(
  payload: TokenPayload,
  expiresIn: string | number = '1h'
): string {
  return jwt.sign(payload, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn
  });
}

/**
 * Generate an expired JWT token for testing auth failure scenarios
 * @param payload - Token payload
 * @returns Expired JWT token
 */
export function generateExpiredToken(payload: TokenPayload): string {
  return jwt.sign(payload, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '-1h' // Already expired
  });
}

/**
 * Generate a token with custom claims for testing specific scenarios
 * @param overrides - Custom claims to override defaults
 * @param expiresIn - Token expiry
 * @returns Signed JWT token
 */
export function generateCustomToken(
  overrides: Partial<TokenPayload> = {},
  expiresIn: string | number = '1h'
): string {
  const defaultPayload: TokenPayload = {
    sub: 'user-1',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    role: 'admin',
    ...overrides,
  };

  return jwt.sign(defaultPayload, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn
  });
}

/**
 * Pre-configured tokens for common test scenarios
 */
export const testTokens = {
  admin: generateTestToken({
    sub: 'admin-1',
    email: 'admin@example.com',
    first_name: 'Admin',
    last_name: 'User',
    role: 'admin',
  }),

  caravan: generateTestToken({
    sub: 'caravan-1',
    email: 'caravan@example.com',
    first_name: 'Field',
    last_name: 'Agent',
    role: 'caravan',
  }),

  tele: generateTestToken({
    sub: 'tele-1',
    email: 'tele@example.com',
    first_name: 'Tele',
    last_name: 'Agent',
    role: 'tele',
  }),

  // Token for mockClient's owner
  clientOwner: generateTestToken({
    sub: 'user-1',
    email: 'juan@example.com',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    role: 'caravan',
  }),

  // Token for different user (testing authorization)
  otherUser: generateTestToken({
    sub: 'user-2',
    email: 'maria@example.com',
    first_name: 'Maria',
    last_name: 'Santos',
    role: 'caravan',
  }),

  expired: generateExpiredToken({
    sub: 'expired-1',
    email: 'expired@example.com',
    first_name: 'Expired',
    last_name: 'Token',
    role: 'caravan',
  }),
};
