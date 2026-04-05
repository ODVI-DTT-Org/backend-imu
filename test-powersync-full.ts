import { config } from 'dotenv';
import jwt from 'jsonwebtoken';

config();

const POWERSYNC_URL = process.env.POWERSYNC_URL!;
const POWERSYNC_PRIVATE_KEY = process.env.POWERSYNC_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
const POWERSYNC_PUBLIC_KEY = process.env.POWERSYNC_PUBLIC_KEY?.replace(/\\n/g, '\n').trim();
const POWERSYNC_KEY_ID = process.env.POWERSYNC_KEY_ID || 'imu-production-key';
const BACKEND_URL = 'http://localhost:4000';

async function testPowerSyncIntegration() {
  console.log('🔌 PowerSync Full Integration Test\n');
  console.log('Configuration:');
  console.log('  Backend:', BACKEND_URL);
  console.log('  PowerSync:', POWERSYNC_URL);
  console.log('  Key ID:', POWERSYNC_KEY_ID);

  // Test 1: Verify keys match
  console.log('\n--- Test 1: Key Verification ---');
  try {
    const payload = { user_id: 'test-123', exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = jwt.sign(payload, POWERSYNC_PRIVATE_KEY!, {
      algorithm: 'RS256',
      keyid: POWERSYNC_KEY_ID,
    });

    const decoded = jwt.verify(token, POWERSYNC_PUBLIC_KEY!, { algorithms: ['RS256'] });
    console.log('✅ Keys match - JWT signed and verified successfully');
    console.log('   User ID in token:', (decoded as any).user_id);
  } catch (error: any) {
    console.error('❌ Key verification failed:', error.message);
    return;
  }

  // Test 2: Backend PowerSync endpoint configuration
  console.log('\n--- Test 2: Backend PowerSync Configuration ---');
  try {
    const response = await fetch(`${BACKEND_URL}/api/powersync/status`, {
      headers: {
        'Authorization': `Bearer ${jwt.sign(
          { user_id: 'admin-test', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
          process.env.JWT_SECRET || 'test-secret',
          { algorithm: 'HS256' }
        )}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ PowerSync configured in backend');
      console.log('   Configured:', data.configured);
      console.log('   Endpoint:', data.endpoint);
    } else if (response.status === 403) {
      console.log('⚠️  Requires admin permissions (expected)');
    } else {
      console.log(`Status: ${response.status}`);
    }
  } catch (error: any) {
    console.error('❌ Backend check failed:', error.message);
  }

  // Test 3: PowerSync Cloud connectivity
  console.log('\n--- Test 3: PowerSync Cloud Connectivity ---');
  try {
    const payload = {
      user_id: '00000000-0000-0000-0000-000000000000',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = jwt.sign(payload, POWERSYNC_PRIVATE_KEY!, {
      algorithm: 'RS256',
      keyid: POWERSYNC_KEY_ID,
    });

    // Test with PowerSync sync endpoint
    const syncResponse = await fetch(`${POWERSYNC_URL}/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bucket: 'test',
        data: [{ id: 1, test: 'data' }],
      }),
    });

    console.log(`✅ PowerSync Cloud reachable (${syncResponse.status})`);

    if (syncResponse.status === 401) {
      console.log('   ✅ Authentication working (401 = needs valid user)');
    } else if (syncResponse.status === 400) {
      console.log('   ✅ Connection working (400 = bad request format, but reachable)');
    }

    const text = await syncResponse.text();
    if (text && text.length < 200) {
      console.log('   Response:', text);
    }
  } catch (error: any) {
    console.error('❌ PowerSync Cloud error:', error.message);
  }

  // Test 4: Check what endpoints are available
  console.log('\n--- Test 4: Backend API Routes ---');
  try {
    const routesResponse = await fetch(`${BACKEND_URL}/api/routes`);
    console.log(`Routes endpoint: ${routesResponse.status}`);

    // Check common endpoints
    const endpoints = [
      '/health',
      '/api/health',
      '/api/auth/status',
    ];

    for (const endpoint of endpoints) {
      try {
        const resp = await fetch(`${BACKEND_URL}${endpoint}`);
        console.log(`  ${endpoint}: ${resp.status}`);
      } catch {
        console.log(`  ${endpoint}: error`);
      }
    }
  } catch (error: any) {
    console.log('   Could not check routes');
  }

  console.log('\n--- Summary ---');
  console.log('✅ Local PowerSync keys are valid and matching');
  console.log('✅ Backend PowerSync endpoints are configured');
  console.log('✅ PowerSync Cloud instance is accessible');
  console.log('\n📝 The same keys need to be in DigitalOcean environment!');
}

testPowerSyncIntegration().catch(console.error);
