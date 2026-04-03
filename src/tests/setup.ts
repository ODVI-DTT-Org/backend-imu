/**
 * Test Setup Configuration
 *
 * Sets up environment variables for tests
 */

import { beforeAll } from 'vitest';

// Set required environment variables for tests
beforeAll(() => {
  // PowerSync keys (using test keys for testing)
  process.env.POWERSYNC_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cJK
ZmLuFKXaYNdTWaUB+bhXmPLcqIxHG1OLvLzY1BqEgHxQ1jBrLpLN+4nUmBPyR/xJ
vD8S8zJYLhVHUjN1aYJKMHlyJK4mCqLpKWWsQHfP5QKXHEVX+FOWLYJSRHuS8XSj
3bKFNAWfDCVPD4yfvvNmLhLvN7A4W7MHtF/x2EjFqcHJJTmF4z1NgNV0NqRdTJqC
fTWVPJH4BNMVhFJDEJxQJGMHNFJE0NqRrSKNPJVCSBxDw0B2Nl/NJqBtRQPDE5QP
vP5l3FVwLMlAThxAz2DwYWNZYgYD5YLMAGW9lCYMVTIBE7/ZBK2hXF+YKmMHpDQJXR
YWFBdGVzdC1rZXktMjAyNjA0MDMwEAAoIBAQC7VJTUt9Us8cJKZmLuFKXaYNdTWaU
-----END PRIVATE KEY-----`;

  process.env.POWERSYNC_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvWUlPS31SzxwkpmYu4U
pdoh11NZpQH5FleY8pyojEcbU4u8vNjUGoSAfFDWMGsuk0/7idSQE/JH/Em8PxLzM
lguFUdSM3VpgOkweXIkrjYKokolZaxAd8/lBpccRVf4U5YtglJEe5LxdKPdsoU0BZ
8MJU8PJh+82YwuE83sDlbsYe0X/HYSMWpwcklOZjPU2A1XQ2pF1MmoJ9NZU8kfgE0x
WEXkMRcl0AkYwc0UkTQ2pGtIo08lULIHMPDQHY2X80moG1FA8MTlA+8/mXcVXAwyU
BPFEDPYPBhY1liBgPlgswBZb2UJxhVMgETr9kEraFcX5iqYwekJFdCkF0ZXN0LWtl
eS0yMDI2MDQwMzAwIDAQAB
-----END PUBLIC KEY-----`;

  // Database (using connection string from env or default)
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/imu_db_test';
  }

  // JWT
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-min-32-chars';
  }

  // PowerSync URL
  if (!process.env.POWERSYNC_URL) {
    process.env.POWERSYNC_URL = 'http://localhost:8080';
  }

  // Node environment
  process.env.NODE_ENV = 'test';
});
