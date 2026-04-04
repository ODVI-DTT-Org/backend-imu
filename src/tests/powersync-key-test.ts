/**
 * PowerSync Key Verification Test
 *
 * This test verifies that PowerSync RSA keys are properly configured:
 * 1. Keys are in correct PEM format
 * 2. Private key matches public key
 * 3. JWT can be signed and verified
 * 4. PowerSync instance is accessible
 *
 * Run: npx tsx src/tests/powersync-key-test.ts
 */

import jwt from 'jsonwebtoken';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, any>;
}

const results: TestResult[] = async function runTests() {
  console.log('🔐 PowerSync Key Verification Test\n');

  // Test 1: Check environment variables
  console.log('Test 1: Checking environment variables...');
  const test1: TestResult = {
    name: 'Environment Variables',
    passed: false,
    message: '',
  };

  const {
    POWERSYNC_URL,
    POWERSYNC_PRIVATE_KEY,
    POWERSYNC_PUBLIC_KEY,
    POWERSYNC_KEY_ID,
  } = process.env;

  if (!POWERSYNC_URL) {
    test1.message = '❌ POWERSYNC_URL not set';
    console.log(test1.message);
    results.push(test1);
    return results;
  }

  if (!POWERSYNC_PRIVATE_KEY) {
    test1.message = '❌ POWERSYNC_PRIVATE_KEY not set';
    console.log(test1.message);
    results.push(test1);
    return results;
  }

  if (!POWERSYNC_PUBLIC_KEY) {
    test1.message = '❌ POWERSYNC_PUBLIC_KEY not set';
    console.log(test1.message);
    results.push(test1);
    return results;
  }

  test1.passed = true;
  test1.message = '✅ All required environment variables are set';
  test1.details = {
    'POWERSYNC_URL': POWERSYNC_URL,
    'POWERSYNC_KEY_ID': POWERSYNC_KEY_ID || 'imu-production-key',
    'Private Key Length': POWERSYNC_PRIVATE_KEY.length,
    'Public Key Length': POWERSYNC_PUBLIC_KEY.length,
  };
  console.log(test1.message);
  console.log('  URL:', POWERSYNC_URL);
  console.log('  Key ID:', POWERSYNC_KEY_ID || 'imu-production-key');
  results.push(test1);

  // Test 2: Validate PEM format
  console.log('\nTest 2: Validating PEM format...');
  const test2: TestResult = {
    name: 'PEM Format Validation',
    passed: false,
    message: '',
  };

  const hasValidPrivateKey = POWERSYNC_PRIVATE_KEY.includes('BEGIN PRIVATE KEY') ||
                             POWERSYNC_PRIVATE_KEY.includes('BEGIN RSA PRIVATE KEY');
  const hasValidPublicKey = POWERSYNC_PUBLIC_KEY.includes('BEGIN PUBLIC KEY') ||
                            POWERSYNC_PUBLIC_KEY.includes('BEGIN RSA PUBLIC KEY');

  if (!hasValidPrivateKey) {
    test2.message = '❌ Private key is not in valid PEM format';
    console.log(test2.message);
    results.push(test2);
    return results;
  }

  if (!hasValidPublicKey) {
    test2.message = '❌ Public key is not in valid PEM format';
    console.log(test2.message);
    results.push(test2);
    return results;
  }

  test2.passed = true;
  test2.message = '✅ Keys are in valid PEM format';
  console.log(test2.message);
  results.push(test2);

  // Test 3: JWT signing and verification
  console.log('\nTest 3: Testing JWT signing and verification...');
  const test3: TestResult = {
    name: 'JWT Signing & Verification',
    passed: false,
    message: '',
    details: {},
  };

  try {
    const privateKey = POWERSYNC_PRIVATE_KEY.replace(/\\n/g, '\n').trim();
    const publicKey = POWERSYNC_PUBLIC_KEY.replace(/\\n/g, '\n').trim();
    const keyId = POWERSYNC_KEY_ID || 'imu-production-key';

    console.log('  Creating test JWT...');
    const testPayload = {
      user_id: '00000000-0000-0000-0000-000000000000',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const testToken = jwt.sign(testPayload, privateKey, {
      algorithm: 'RS256',
      keyid: keyId,
    });

    test3.details['Token Created'] = 'Yes';
    test3.details['Token Length'] = testToken.length;
    console.log('  ✅ Token created (length:', testToken.length, 'bytes)');

    console.log('  Verifying JWT with public key...');
    const decoded = jwt.verify(testToken, publicKey, {
      algorithms: ['RS256'],
    });

    test3.details['Verification'] = 'Success';
    test3.details['Decoded User ID'] = (decoded as any).user_id;
    console.log('  ✅ JWT verified successfully');
    console.log('  Decoded user_id:', (decoded as any).user_id);

    test3.passed = true;
    test3.message = '✅ JWT signing and verification working';
    console.log(test3.message);
  } catch (error: any) {
    test3.message = '❌ JWT test failed';
    test3.details['Error'] = error.message;
    test3.details['Error Name'] = error.name;

    if (error.name === 'JsonWebTokenError') {
      if (error.message.includes('invalid signature')) {
        test3.details['Diagnosis'] = '⚠️ PRIVATE KEY AND PUBLIC KEY DO NOT MATCH!';
        console.error('  ❌', test3.details['Diagnosis']);
        console.error('  → Check that both keys are from the same key pair');
      } else if (error.message.includes('malformed')) {
        test3.details['Diagnosis'] = '⚠️ Key format is invalid';
        console.error('  ❌', test3.details['Diagnosis']);
        console.error('  → Check that keys are in proper PEM format with \\n escapes');
      }
    }

    console.error('  Error:', error.message);
    results.push(test3);
    return results;
  }

  results.push(test3);

  // Test 4: PowerSync connection
  console.log('\nTest 4: Testing PowerSync connection...');
  const test4: TestResult = {
    name: 'PowerSync Connection',
    passed: false,
    message: '',
    details: {},
  };

  try {
    console.log('  Connecting to:', POWERSYNC_URL);
    const response = await fetch(`${POWERSYNC_URL}/api`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    test4.details['Status Code'] = response.status;
    test4.details['Response OK'] = response.ok;

    if (response.ok || response.status === 401) {
      test4.passed = true;
      test4.message = '✅ PowerSync instance is accessible';
      console.log('  ✅ Connection successful (status:', response.status, ')');
    } else {
      test4.message = `⚠️ Unexpected status: ${response.status}`;
      console.log('  ⚠️', test4.message);
    }
  } catch (error: any) {
    test4.message = '⚠️ Connection test failed';
    test4.details['Error'] = error.message;
    console.log('  ⚠️', error.message);
    console.log('  → This may be temporary or due to network restrictions');
  }

  results.push(test4);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach((result, index) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${result.name}: ${result.message}`);
    if (result.details && Object.keys(result.details).length > 0) {
      console.log('   Details:', JSON.stringify(result.details, null, 2).split('\n').join('\n   '));
    }
  });

  console.log('='.repeat(60));
  console.log(`Total: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 All tests passed! PowerSync is properly configured.');
  } else {
    console.log('⚠️ Some tests failed. Please check the errors above.');
  }

  return results;
}();

export { results };
