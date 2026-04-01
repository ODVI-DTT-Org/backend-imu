/**
 * Test script for touchpoint sequence validation
 *
 * This script tests the new touchpoint sequence validation API endpoints.
 *
 * Usage:
 *   node test-touchpoint-validation.js
 *
 * Prerequisites:
 *   - Set AUTH_TOKEN environment variable with a valid JWT token
 *   - Set API_URL environment variable (default: http://localhost:3001)
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// Test data
const testClientId = process.env.TEST_CLIENT_ID || 'YOUR_CLIENT_ID_HERE';

/**
 * Test 1: Get next touchpoint info for a client
 */
async function testGetNextTouchpoint() {
  console.log('\n=== Test 1: Get Next Touchpoint Info ===');
  try {
    const response = await fetch(`${API_URL}/api/touchpoints/next/${testClientId}`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Success:');
      console.log(JSON.stringify(data, null, 2));
      return data;
    } else {
      console.log('❌ Failed:', response.status, data.message);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

/**
 * Test 2: Create touchpoint with correct sequence (should succeed)
 */
async function testCreateCorrectTouchpoint() {
  console.log('\n=== Test 2: Create Touchpoint (Correct Sequence) ===');

  // First get the next expected touchpoint
  const nextInfo = await testGetNextTouchpoint();
  if (!nextInfo || !nextInfo.nextTouchpointNumber) {
    console.log('⚠️  Skipping: No next touchpoint available');
    return;
  }

  const touchpointData = {
    client_id: testClientId,
    touchpoint_number: nextInfo.nextTouchpointNumber,
    type: nextInfo.nextTouchpointType,
    date: new Date().toISOString(),
    reason: 'INTERESTED',
    notes: 'Test touchpoint with correct sequence',
  };

  try {
    const response = await fetch(`${API_URL}/api/touchpoints`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(touchpointData),
    });

    const data = await response.json();

    if (response.ok || response.status === 201) {
      console.log('✅ Success: Touchpoint created');
      console.log(JSON.stringify(data, null, 2));
      return data;
    } else {
      console.log('❌ Failed:', response.status, data.message);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

/**
 * Test 3: Create touchpoint with wrong type (should fail)
 */
async function testCreateWrongType() {
  console.log('\n=== Test 3: Create Touchpoint (Wrong Type - Should Fail) ===');

  // First get the next expected touchpoint
  const nextInfo = await testGetNextTouchpoint();
  if (!nextInfo || !nextInfo.nextTouchpointNumber) {
    console.log('⚠️  Skipping: No next touchpoint available');
    return;
  }

  // Use the wrong type
  const wrongType = nextInfo.nextTouchpointType === 'Visit' ? 'Call' : 'Visit';

  const touchpointData = {
    client_id: testClientId,
    touchpoint_number: nextInfo.nextTouchpointNumber,
    type: wrongType,
    date: new Date().toISOString(),
    reason: 'INTERESTED',
    notes: 'Test touchpoint with wrong type',
  };

  try {
    const response = await fetch(`${API_URL}/api/touchpoints`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(touchpointData),
    });

    const data = await response.json();

    if (!response.ok && response.status === 400) {
      console.log('✅ Expected failure: Validation worked');
      console.log('Error message:', data.message);
      console.log('Expected type:', data.expectedType);
      console.log('Provided type:', data.providedType);
      console.log('Sequence:', data.sequence);
      return data;
    } else {
      console.log('❌ Unexpected: Should have failed validation');
      console.log(JSON.stringify(data, null, 2));
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

/**
 * Test 4: Create touchpoint with wrong number (should fail)
 */
async function testCreateWrongNumber() {
  console.log('\n=== Test 4: Create Touchpoint (Wrong Number - Should Fail) ===');

  // First get the next expected touchpoint
  const nextInfo = await testGetNextTouchpoint();
  if (!nextInfo || !nextInfo.nextTouchpointNumber) {
    console.log('⚠️  Skipping: No next touchpoint available');
    return;
  }

  // Use a wrong number (skip ahead)
  const wrongNumber = Math.min(nextInfo.nextTouchpointNumber + 1, 7);

  const touchpointData = {
    client_id: testClientId,
    touchpoint_number: wrongNumber,
    type: nextInfo.nextTouchpointType,
    date: new Date().toISOString(),
    reason: 'INTERESTED',
    notes: 'Test touchpoint with wrong number',
  };

  try {
    const response = await fetch(`${API_URL}/api/touchpoints`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(touchpointData),
    });

    const data = await response.json();

    if (!response.ok && response.status === 400) {
      console.log('✅ Expected failure: Validation worked');
      console.log('Error message:', data.message);
      console.log('Expected number:', data.expectedNumber);
      console.log('Provided number:', data.providedNumber);
      console.log('Sequence:', data.sequence);
      return data;
    } else {
      console.log('❌ Unexpected: Should have failed validation');
      console.log(JSON.stringify(data, null, 2));
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

/**
 * Test 5: Verify sequence pattern
 */
async function testSequencePattern() {
  console.log('\n=== Test 5: Verify Sequence Pattern ===');

  const expectedSequence = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'];
  console.log('Expected sequence:');
  expectedSequence.forEach((type, index) => {
    console.log(`  ${index + 1}. ${type}`);
  });

  return expectedSequence;
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('========================================');
  console.log('Touchpoint Sequence Validation Tests');
  console.log('========================================');
  console.log(`API URL: ${API_URL}`);
  console.log(`Client ID: ${testClientId}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? 'Set' : 'NOT SET - Tests will fail'}`);

  if (!AUTH_TOKEN) {
    console.log('\n⚠️  WARNING: AUTH_TOKEN not set!');
    console.log('Set it with: export AUTH_TOKEN=your_token_here\n');
    return;
  }

  if (testClientId === 'YOUR_CLIENT_ID_HERE') {
    console.log('\n⚠️  WARNING: TEST_CLIENT_ID not set!');
    console.log('Set it with: export TEST_CLIENT_ID=your_client_id_here\n');
    return;
  }

  // Run tests
  await testGetNextTouchpoint();
  await testCreateCorrectTouchpoint();
  await testCreateWrongType();
  await testCreateWrongNumber();
  await testSequencePattern();

  console.log('\n========================================');
  console.log('Tests Complete');
  console.log('========================================\n');
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testGetNextTouchpoint,
  testCreateCorrectTouchpoint,
  testCreateWrongType,
  testCreateWrongNumber,
  testSequencePattern,
};
