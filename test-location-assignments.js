/**
 * Test Location Assignments API endpoints
 */

async function testLocationAssignments() {
  const BASE_URL = 'http://localhost:3000/api';

  console.log('🧪 Testing Location Assignments API...\n');

  try {
    // Step 1: Register a test user
    console.log('1️⃣ Creating test user...');
    const testUserEmail = `test-${Date.now()}@example.com`;
    const registerResponse = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: 'password123',
        first_name: 'Test',
        last_name: 'Agent',
        role: 'field_agent'
      })
    });

    if (!registerResponse.ok) {
      throw new Error(`Registration failed: ${registerResponse.status}`);
    }
    const registerData = await registerResponse.json();
    const userId = registerData.user.id;
    console.log(`   ✅ User created: ${testUserEmail}`);
    console.log(`   📝 User ID: ${userId}\n`);

    // Step 2: Login to get token
    console.log('2️⃣ Logging in...');
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: 'password123'
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }
    const loginData = await loginResponse.json();
    const token = loginData.access_token;
    console.log(`   ✅ Logged in successfully\n`);

    // Step 3: Test PSGC regions endpoint
    console.log('3️⃣ Testing PSGC regions endpoint...');
    const regionsResponse = await fetch(`${BASE_URL}/psgc/regions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!regionsResponse.ok) {
      throw new Error(`Regions failed: ${regionsResponse.status}`);
    }
    const regionsData = await regionsResponse.json();
    console.log(`   ✅ Found ${regionsData.items.length} regions`);
    console.log(`   📍 Sample regions: ${regionsData.items.slice(0, 3).map(r => r.name).join(', ')}\n`);

    // Step 4: Get provinces for a region
    console.log('4️⃣ Testing provinces endpoint (NCR)...');
    const provincesResponse = await fetch(`${BASE_URL}/psgc/provinces?region=National Capital Region (NCR)`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!provincesResponse.ok) {
      throw new Error(`Provinces failed: ${provincesResponse.status}`);
    }
    const provincesData = await provincesResponse.json();
    console.log(`   ✅ Found ${provincesData.items.length} provinces/municipalities in NCR\n`);

    // Step 5: Get barangays
    console.log('5️⃣ Testing barangays endpoint...');
    const barangaysResponse = await fetch(`${BASE_URL}/psgc/barangays?province=National Capital Region (NCR)&municipality=Metro Manila&perPage=5`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!barangaysResponse.ok) {
      throw new Error(`Barangays failed: ${barangaysResponse.status}`);
    }
    const barangaysData = await barangaysResponse.json();
    console.log(`   ✅ Found ${barangaysData.items.length} barangays`);
    console.log(`   📍 Sample barangays: ${barangaysData.items.slice(0, 3).map(b => b.barangay).join(', ')}\n`);

    // Step 6: Test user assignments (should be empty initially)
    console.log('6️⃣ Testing user assignments endpoint (initial)...');
    const assignmentsResponse = await fetch(`${BASE_URL}/psgc/user/${userId}/assignments`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!assignmentsResponse.ok) {
      throw new Error(`Assignments failed: ${assignmentsResponse.status}`);
    }
    const assignmentsData = await assignmentsResponse.json();
    console.log(`   ✅ Current assignments: ${assignmentsData.items.length} locations\n`);

    // Step 7: Assign a barangay to the user
    if (barangaysData.items.length > 0) {
      console.log('7️⃣ Assigning a barangay to user...');
      const psgcId = barangaysData.items[0].id;
      const assignResponse = await fetch(`${BASE_URL}/psgc/user/${userId}/assignments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          psgc_ids: [psgcId]
        })
      });

      if (!assignResponse.ok) {
        throw new Error(`Assignment failed: ${assignResponse.status}`);
      }
      const assignData = await assignResponse.json();
      console.log(`   ✅ Assignment successful: ${assignData.message}\n`);

      // Step 8: Verify the assignment
      console.log('8️⃣ Verifying assignment...');
      const verifyResponse = await fetch(`${BASE_URL}/psgc/user/${userId}/assignments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!verifyResponse.ok) {
        throw new Error(`Verify failed: ${verifyResponse.status}`);
      }
      const verifyData = await verifyResponse.json();
      console.log(`   ✅ User now has ${verifyData.items.length} location(s) assigned`);
      if (verifyData.items.length > 0) {
        const loc = verifyData.items[0].psgc;
        console.log(`   📍 Assigned: ${loc.barangay}, ${loc.municipality}, ${loc.province}\n`);
      }

      // Step 9: Remove the assignment
      console.log('9️⃣ Removing assignment...');
      const removeResponse = await fetch(`${BASE_URL}/psgc/user/${userId}/assignments/${psgcId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!removeResponse.ok) {
        throw new Error(`Remove failed: ${removeResponse.status}`);
      }
      console.log(`   ✅ Assignment removed successfully\n`);
    }

    console.log('✅ All location assignment tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testLocationAssignments();
