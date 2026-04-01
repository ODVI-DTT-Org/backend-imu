/**
 * Test PSGC API endpoints
 * Run: npx tsx scripts/test-psgc-api.ts
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TOKEN = process.env.TEST_TOKEN || '';

async function testPsgcEndpoints() {
  console.log('Testing PSGC endpoints...\n');

  const headers: Record<string, string> = {};
  if (TOKEN) {
    headers['Authorization'] = `Bearer ${TOKEN}`;
  }

  try {
    // Test 1: Get regions
    console.log('1. Testing GET /api/psgc/regions...');
    const regionsRes = await fetch(`${BASE_URL}/api/psgc/regions`, { headers });
    const regionsData = await regionsRes.json();
    console.log('   Status:', regionsRes.status);
    console.log('   Items:', regionsData.items?.length || 0, 'regions');

    // Test 2: Get provinces
    console.log('\n2. Testing GET /api/psgc/provinces...');
    const provincesRes = await fetch(`${BASE_URL}/api/psgc/provinces`, { headers });
    const provincesData = await provincesRes.json();
    console.log('   Status:', provincesRes.status);
    console.log('   Items:', provincesData.items?.length || 0, 'provinces');

    // Test 3: Get municipalities
    console.log('\n3. Testing GET /api/psgc/municipalities...');
    const munsRes = await fetch(`${BASE_URL}/api/psgc/municipalities`, { headers });
    const munsData = await munsRes.json();
    console.log('   Status:', munsRes.status);
    console.log('   Items:', munsData.items?.length || 0, 'municipalities');

    // Test 4: Search
    console.log('\n4. Testing GET /api/psgc/search?q=manila...');
    const searchRes = await fetch(`${BASE_URL}/api/psgc/search?q=manila`, { headers });
    const searchData = await searchRes.json();
    console.log('   Status:', searchRes.status);
    console.log('   Items:', searchData.items?.length || 0, 'results');

    // Test 5: Hierarchy
    console.log('\n5. Testing GET /api/psgc/hierarchy...');
    const hierarchyRes = await fetch(`${BASE_URL}/api/psgc/hierarchy`, { headers });
    const hierarchyData = await hierarchyRes.json();
    console.log('   Status:', hierarchyRes.status);
    console.log('   Regions in hierarchy:', hierarchyData.hierarchy?.length || 0);

    console.log('\n✅ All PSGC endpoint tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testPsgcEndpoints();
