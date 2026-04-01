/**
 * Test PSGC API endpoints
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TOKEN = process.env.TEST_TOKEN || '';

async function testPsgcEndpoints() {
  console.log('Testing PSGC endpoints...\n');

  try {
    const response = await fetch(`${BASE_URL}/api/psgc/regions`);
    const data = await response.json();

    console.log('1. Regions:', response.status, data.items.slice(0, 3));

    const response2 = await fetch(`${BASE_URL}/api/psgc/provinces`);
    const data = await response.json();

    console.log('2. Provinces:', response.status, data.items.slice(0, 2));

    const response3 = await fetch(`${BASE_URL}/api/psgc/municipalities`);
    const data = await response.json();

    console.log('3. Municipalities:', response.status, data.items.slice(0, 2));

    const response4 = await fetch(`${BASE_URL}/api/psgc/barangays?per_page=1`);
    const data = await response.json();

    console.log('4. Barangays (1st page): data);

    const response5 = await fetch(`${BASE_URL}/api/psgc/barangays?per_page=1&per_page=100`);
    const data = await response.json();

    console.log('5. Barangays (100 per page): data);

    const response6 = await fetch(`${BASE_URL}/api/psgc/search?q=manila`);
    const data = await response.json();

    console.log('6. Search "manila":', response.status, data.items.slice(0, 3));

    const response7 = await fetch(`${BASE_URL}/api/psgc/hierarchy`);
    const data = await response.json();

    console.log('7. Hierarchy:', response.status, data);

    const response8 = await fetch(`${BASE_URL}/api/psgc/user/1/assignments`,    const token = TOKEN;

    const data = await response.json();
    console.log('8. User 1 Assignments:', response.status, data.items);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n✅ All PSGC endpoint tests completed!');
  });
}

testPsgcEndpoints();
