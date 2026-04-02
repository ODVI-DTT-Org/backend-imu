/**
 * Test PowerSync Connection
 *
 * This script tests if PowerSync is properly configured and syncing data.
 * It generates a JWT token and queries the PowerSync API to check sync status.
 */

import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// PowerSync Configuration
const POWERSYNC_URL = 'https://69cd6b238fa42c16d7f725a9.powersync.journeyapps.com';
const POWERSYNC_INSTANCE_ID = '69cd6b238fa42c16d7f725a9';

// Load RSA keys from files
const POWERSYNC_PRIVATE_KEY = readFileSync(join(__dirname, '../keys/powersync-private.pem'), 'utf-8');
const POWERSYNC_KEY_ID = 'imu-production-key-20260402';

/**
 * Generate a PowerSync JWT token for testing
 */
function generatePowerSyncToken(userId: string = 'test-user-123'): string {
  const payload = {
    user_id: userId,
    sub: userId,
    iss: 'imu-backend',
    aud: POWERSYNC_URL,
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, POWERSYNC_PRIVATE_KEY, {
    algorithm: 'RS256',
    keyid: POWERSYNC_KEY_ID,
  });
}

/**
 * Test PowerSync connection and sync status
 */
async function testPowerSyncConnection() {
  console.log('🔍 Testing PowerSync Connection...\n');

  // Generate token
  const token = generatePowerSyncToken();
  console.log('✅ Generated PowerSync JWT token');
  console.log('   Token (first 50 chars):', token.substring(0, 50) + '...\n');

  // Test 1: Check PowerSync API health
  console.log('📡 Testing PowerSync API Health...');
  try {
    const response = await fetch(`${POWERSYNC_URL}/`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      console.log('✅ PowerSync API is accessible');
      console.log('   Status:', response.status, response.statusText);
    } else {
      console.log('ℹ️ PowerSync API response (this is expected):');
      console.log('   Status:', response.status, response.statusText);
    }
  } catch (error) {
    console.log('❌ Failed to connect to PowerSync API');
    console.log('   Error:', (error as Error).message);
  }
  console.log();

  // Test 2: Check sync streams status
  console.log('📊 Testing PowerSync Sync Streams Status...');
  try {
    const response = await fetch(`${POWERSYNC_URL}/api/v1/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Sync streams status received');
      console.log('   Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('ℹ️ Status endpoint response:', response.status, response.statusText);
      const text = await response.text();
      if (text) console.log('   Response:', text.substring(0, 200));
    }
  } catch (error) {
    console.log('❌ Failed to check sync streams status');
    console.log('   Error:', (error as Error).message);
  }
  console.log();

  // Test 3: Check if we can get sync configuration
  console.log('🔧 Testing PowerSync Sync Configuration...');
  try {
    const response = await fetch(`${POWERSYNC_URL}/api/v1/sync/config`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Sync config received');
      console.log('   Streams configured:', Object.keys(data.data || {}).length);
      if (data.data?.psgc) {
        console.log('   ✅ PSGC stream is configured');
      }
      if (data.data?.touchpoint_reasons) {
        console.log('   ✅ Touchpoint Reasons stream is configured');
      }
    } else {
      console.log('ℹ️ Sync config response:', response.status, response.statusText);
    }
  } catch (error) {
    console.log('❌ Failed to check sync configuration');
    console.log('   Error:', (error as Error).message);
  }
  console.log();

  // Test 3: Decode and display token info
  console.log('🔐 JWT Token Information:');
  try {
    const decoded = jwt.decode(token);
    console.log('✅ Token decoded successfully');
    console.log('   Subject:', decoded?.sub);
    console.log('   Issuer:', decoded?.iss);
    console.log('   Audience:', decoded?.aud);
    console.log('   Expires At:', new Date((decoded?.exp as number) * 1000).toISOString());
    console.log('   Key ID:', decoded?.kid || '(in header)');
  } catch (error) {
    console.log('❌ Failed to decode token');
    console.log('   Error:', (error as Error).message);
  }

  console.log('\n✨ PowerSync test completed!\n');
}

// Run the test
testPowerSyncConnection().catch(console.error);
