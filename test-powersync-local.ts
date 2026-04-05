import { config } from 'dotenv';
import jwt from 'jsonwebtoken';

config();

const POWERSYNC_URL = process.env.POWERSYNC_URL!;
const POWERSYNC_PRIVATE_KEY = process.env.POWERSYNC_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
const POWERSYNC_KEY_ID = process.env.POWERSYNC_KEY_ID || 'imu-production-key';
const BACKEND_URL = 'http://localhost:4000';

async function testLocalBackend() {
  console.log('🧪 Testing Local Backend PowerSync Integration\n');

  // Generate a test JWT like the backend does
  console.log('1. Generating PowerSync JWT...');
  const payload = {
    user_id: '00000000-0000-0000-0000-000000000000',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const token = jwt.sign(payload, POWERSYNC_PRIVATE_KEY!, {
    algorithm: 'RS256',
    keyid: POWERSYNC_KEY_ID,
  });

  console.log('✅ JWT generated');
  console.log('   Token preview:', token.substring(0, 50) + '...');

  // Test local backend health
  console.log('\n2. Testing local backend health...');
  try {
    const healthResponse = await fetch(`${BACKEND_URL}/health`);
    console.log(`✅ Backend health: ${healthResponse.status}`);
  } catch (error: any) {
    console.error('❌ Backend not responding:', error.message);
    return;
  }

  // Test PowerSync status endpoint
  console.log('\n3. Testing /api/powersync/status...');
  try {
    const statusResponse = await fetch(`${BACKEND_URL}/api/powersync/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (statusResponse.ok) {
      const data = await statusResponse.json();
      console.log('✅ PowerSync status endpoint working');
      console.log('   Configured:', data.configured);
      console.log('   Endpoint:', data.endpoint);
      console.log('   Has private key:', data.hasPrivateKey);
      console.log('   Has public key:', data.hasPublicKey);
    } else {
      const error = await statusResponse.text();
      console.log(`❌ Status failed (${statusResponse.status}):`, error);
    }
  } catch (error: any) {
    console.error('❌ Status endpoint error:', error.message);
  }

  // Test PowerSync token endpoint
  console.log('\n4. Testing /api/powersync/token (requires auth)...');
  try {
    // First, try without auth (should fail)
    const noAuthResponse = await fetch(`${BACKEND_URL}/api/powersync/token`);
    console.log(`   Without auth: ${noAuthResponse.status} (expected 401)`);

    // Try with a fake auth token (should fail but different error)
    const fakeAuthResponse = await fetch(`${BACKEND_URL}/api/powersync/token`, {
      headers: {
        'Authorization': 'Bearer fake-token',
      },
    });
    console.log(`   With fake token: ${fakeAuthResponse.status}`);
  } catch (error: any) {
    console.error('❌ Token endpoint error:', error.message);
  }

  // Test direct PowerSync connection
  console.log('\n5. Testing direct PowerSync Cloud connection...');
  try {
    const syncResponse = await fetch(POWERSYNC_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`✅ PowerSync Cloud responding (${syncResponse.status})`);
  } catch (error: any) {
    console.error('❌ PowerSync Cloud error:', error.message);
  }

  console.log('\n✅ Local backend PowerSync integration test complete!');
}

testLocalBackend().catch(console.error);
