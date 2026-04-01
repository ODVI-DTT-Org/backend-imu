/**
 * Simple PSGC API tests
 * Run: npx tsx test-psgc-simple.js
 */

import 'dotenv/config';
import { Pool } from 'pg';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false,
});

async function testPsgcDatabase() {
  console.log('Testing PSGC database integration...\n');

  try {
    // Test 1: Check regions view
    const regionsResult = await pool.query('SELECT * FROM psgc_regions LIMIT 5');
    console.log('1. PSGC Regions:', regionsResult.rows.length, 'rows');
    console.log('   Sample:', regionsResult.rows[0]);

    // Test 2: Check provinces view
    const provincesResult = await pool.query('SELECT * FROM psgc_provinces LIMIT 5');
    console.log('2. PSGC Provinces:', provincesResult.rows.length
 'rows');
    console.log('   Sample:', provincesResult.rows[0]);

    // Test 3: Check municipalities view
    const munsResult = await pool.query('SELECT * FROM psgc_municipalities LIMIT 5');
    console.log('3. PSGC Municipalities:', munsResult.rows.length
 'rows');
    console.log('   Sample:', munsResult.rows[0]);

    // Test 4: Check barangays view
    const brgyResult = await pool.query('SELECT * FROM psgc_barangays LIMIT 5');
    console.log('4. PSGC Barangays:', brgyResult.rows.length
 'rows');
    console.log('   Sample:', brgyResult.rows[0]);

    // Test 5: Search query
    const searchResult = await pool.query(`
      SELECT id, region, province, mun_city, barangay
      FROM psgc
      WHERE barangay ILIKE '%Poblacion%'
      LIMIT 5
    `);
    console.log('5. Search "Poblacion":', searchResult.rows.length
 'results');
    console.log('   Sample:', searchResult.rows[0]);

    // Test 6: Count by region
    const countResult = await pool.query(`
      SELECT region, COUNT(*) as count
      FROM psgc
      GROUP BY region
      ORDER BY count DESC
      LIMIT 5
    `);
    console.log('6. Count by region:');
    console.table(countResult.rows);

    console.log('\n✅ All PSGC database tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

testPsgcDatabase();
