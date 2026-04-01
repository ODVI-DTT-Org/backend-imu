/**
 * Test PSGC data in detail
 */

async function testPSGCData() {
  const BASE_URL = 'http://localhost:3000/api';

  console.log('🧪 Testing PSGC Data...\n');

  try {
    // Try to login, otherwise register admin user
    let token;
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@imu.test',
        password: 'admin123'
      })
    });

    if (loginResponse.ok) {
      const loginData = await loginResponse.json();
      token = loginData.access_token;
      console.log('✅ Logged in as admin\n');
    } else {
      // Register admin user
      console.log('Creating admin user...');
      await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@imu.test',
          password: 'admin123',
          first_name: 'Admin',
          last_name: 'User',
          role: 'admin'
        })
      });

      // Login again
      const loginResponse2 = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@imu.test',
          password: 'admin123'
        })
      });
      const loginData2 = await loginResponse2.json();
      token = loginData2.access_token;
      console.log('✅ Admin user created and logged in\n');
    }

    // Test 1: Get all regions
    console.log('1️⃣ All Regions:');
    const regionsResponse = await fetch(`${BASE_URL}/psgc/regions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const regionsData = await regionsResponse.json();
    regionsData.items.forEach((r, i) => {
      if (i < 5) console.log(`   - ${r.name}`);
    });
    console.log(`   ... and ${regionsData.items.length - 5} more\n`);

    // Test 2: Get provinces for NCR
    console.log('2️⃣ Provinces in NCR:');
    const provincesResponse = await fetch(`${BASE_URL}/psgc/provinces?region=National Capital Region (NCR)`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const provincesData = await provincesResponse.json();
    provincesData.items.forEach(p => console.log(`   - ${p.name}`));
    console.log('');

    // Test 3: Get municipalities in NCR
    console.log('3️⃣ Municipalities in NCR:');
    const munsResponse = await fetch(`${BASE_URL}/psgc/municipalities?region=National Capital Region (NCR)`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const munsData = await munsResponse.json();
    munsData.items.slice(0, 10).forEach(m => console.log(`   - ${m.name} (${m.id})`));
    console.log(`   ... and ${munsData.items.length - 10} more\n`);

    // Test 4: Get barangays for a specific municipality
    console.log('4️⃣ Barangays in Manila:');
    const barangaysResponse = await fetch(`${BASE_URL}/psgc/barangays?municipality=Manila&perPage=5`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const barangaysData = await barangaysResponse.json();
    console.log(`   Total: ${barangaysData.totalItems} barangays`);
    barangaysData.items.forEach(b => {
      console.log(`   - ${b.barangay} (ID: ${b.id}, Zip: ${b.zipCode})`);
    });
    console.log('');

    // Test 5: Search functionality
    console.log('5️⃣ Search for "Makati":');
    const searchResponse = await fetch(`${BASE_URL}/psgc/search?q=Makati`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const searchData = await searchResponse.json();
    searchData.items.slice(0, 5).forEach(item => {
      console.log(`   - [${item.type}] ${item.label}`);
    });
    console.log('');

    console.log('✅ All PSGC data tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testPSGCData();
