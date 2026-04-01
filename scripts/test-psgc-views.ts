import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false,
});

async function testPsgc() {
  console.log('Testing PSGC database integration...\n');

  try {
    // Test 1: Check if psgc table exists and has data
    const countResult = await pool.query('SELECT COUNT(*) as total FROM psgc');
    console.log('1. Total PSGC records:', countResult.rows[0].total);

    // Test 2: Check psgc_regions view
    try {
      const regionsResult = await pool.query('SELECT * FROM psgc_regions LIMIT 5');
      console.log('2. psgc_regions view:', regionsResult.rows.length, 'regions');
      if (regionsResult.rows.length > 0) {
        console.log('   Sample:', regionsResult.rows[0]);
      }
    } catch (e: any) {
      console.log('2. psgc_regions view: ERROR -', e.message);
    }

    // Test 3: Check psgc_provinces view
    try {
      const provincesResult = await pool.query('SELECT * FROM psgc_provinces LIMIT 5');
      console.log('3. psgc_provinces view:', provincesResult.rows.length, 'provinces');
      if (provincesResult.rows.length > 0) {
        console.log('   Sample:', provincesResult.rows[0]);
      }
    } catch (e: any) {
      console.log('3. psgc_provinces view: ERROR -', e.message);
    }

    // Test 4: Check psgc_municipalities view
    try {
      const munsResult = await pool.query('SELECT * FROM psgc_municipalities LIMIT 5');
      console.log('4. psgc_municipalities view:', munsResult.rows.length, 'municipalities');
      if (munsResult.rows.length > 0) {
        console.log('   Sample:', munsResult.rows[0]);
      }
    } catch (e: any) {
      console.log('4. psgc_municipalities view: ERROR -', e.message);
    }

    // Test 5: Check psgc_barangays view
    try {
      const brgyResult = await pool.query('SELECT * FROM psgc_barangays LIMIT 5');
      console.log('5. psgc_barangays view:', brgyResult.rows.length, 'barangays');
      if (brgyResult.rows.length > 0) {
        console.log('   Sample:', brgyResult.rows[0]);
      }
    } catch (e: any) {
      console.log('5. psgc_barangays view: ERROR -', e.message);
    }

    // Test 6: Search query
    try {
      const searchResult = await pool.query(`
        SELECT id, region, province, mun_city, barangay
        FROM psgc
        WHERE barangay ILIKE '%Poblacion%'
        LIMIT 5
      `);
      console.log('6. Search "Poblacion":', searchResult.rows.length, 'results');
      if (searchResult.rows.length > 0) {
        console.log('   Sample:', searchResult.rows[0]);
      }
    } catch (e: any) {
      console.log('6. Search query: ERROR -', e.message);
    }

    // Test 7: Check user_psgc_assignments table
    try {
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'user_psgc_assignments'
        ) as exists
      `);
      console.log('7. user_psgc_assignments table exists:', tableCheck.rows[0].exists);
    } catch (e: any) {
      console.log('7. user_psgc_assignments check: ERROR -', e.message);
    }

    console.log('\n✅ PSGC database tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

testPsgc();
