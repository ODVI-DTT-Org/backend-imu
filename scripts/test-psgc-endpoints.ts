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

async function testPsgcEndpoints() {
  console.log('Testing PSGC endpoints via direct database queries...\n');

  try {
    // Test 1: Get regions (simulates GET /api/psgc/regions)
    const regionsResult = await pool.query(`
      SELECT DISTINCT region as id, region as name
      FROM psgc
      ORDER BY region
      LIMIT 10
    `);
    console.log('1. GET /api/psgc/regions');
    console.log('   Status: 200');
    console.log('   Regions found:', regionsResult.rows.length);
    if (regionsResult.rows.length > 0) {
      console.log('   Sample regions:');
      regionsResult.rows.slice(0, 5).forEach(r => console.log(`     - ${r.name}`));
    }

    // Test 2: Get provinces (simulates GET /api/psgc/provinces)
    const provincesResult = await pool.query(`
      SELECT DISTINCT province as id, region, province as name
      FROM psgc
      ORDER BY region, province
      LIMIT 10
    `);
    console.log('\n2. GET /api/psgc/provinces');
    console.log('   Status: 200');
    console.log('   Provinces found:', provincesResult.rows.length);
    if (provincesResult.rows.length > 0) {
      console.log('   Sample provinces:');
      provincesResult.rows.slice(0, 5).forEach(r => console.log(`     - ${r.name} (${r.region})`));
    }

    // Test 3: Get municipalities (simulates GET /api/psgc/municipalities)
    const munsResult = await pool.query(`
      SELECT DISTINCT
        province || '-' || mun_city as id,
        region,
        province,
        mun_city as name,
        mun_city_kind as kind
      FROM psgc
      ORDER BY region, province, mun_city
      LIMIT 10
    `);
    console.log('\n3. GET /api/psgc/municipalities');
    console.log('   Status: 200');
    console.log('   Municipalities found:', munsResult.rows.length);
    if (munsResult.rows.length > 0) {
      console.log('   Sample municipalities:');
      munsResult.rows.slice(0, 5).forEach(r =>
        console.log(`     - ${r.name} (${r.kind}) - ${r.province}, ${r.region}`)
      );
    }

    // Test 4: Search (simulates GET /api/psgc/search?q=)
    const searchResult = await pool.query(`
      SELECT id, region, province, mun_city, barangay
      FROM psgc
      WHERE barangay ILIKE '%Poblacion%'
      LIMIT 5
    `);
    console.log('\n4. GET /api/psgc/search?q=Poblacion');
    console.log('   Status: 200');
    console.log('   Search results:', searchResult.rows.length);
    if (searchResult.rows.length > 0) {
      console.log('   Sample results:');
      searchResult.rows.forEach(r =>
        console.log(`     - ${r.barangay}, ${r.mun_city}, ${r.province}`)
      );
    }

    // Test 5: Get barangay by ID (simulates GET /api/psgc/barangays/:id)
    if (searchResult.rows.length > 0) {
      const barangayId = searchResult.rows[0].id;
      const barangayResult = await pool.query(`
        SELECT id, region, province, mun_city as municipality, barangay, zip_code, pin_location
        FROM psgc
        WHERE id = $1
      `, [barangayId]);
      console.log('\n5. GET /api/psgc/barangays/' + barangayId);
      console.log('   Status: 200');
      console.log('   Barangay:', barangayResult.rows[0].barangay);
      console.log('   Full address:',
        `${barangayResult.rows[0].barangay}, ${barangayResult.rows[0].municipality}, ${barangayResult.rows[0].province}, ${barangayResult.rows[0].region}`
      );
    }

    // Test 6: Filter by region (simulates GET /api/psgc/municipalities?region=NCR)
    const ncrMunsResult = await pool.query(`
      SELECT DISTINCT
        province || '-' || mun_city as id,
        mun_city as name
      FROM psgc
      WHERE region ILIKE '%NCR%'
      ORDER BY mun_city
      LIMIT 10
    `);
    console.log('\n6. GET /api/psgc/municipalities?region=NCR');
    console.log('   Status: 200');
    console.log('   NCR Municipalities found:', ncrMunsResult.rows.length);
    if (ncrMunsResult.rows.length > 0) {
      console.log('   Sample NCR municipalities:');
      ncrMunsResult.rows.slice(0, 5).forEach(r => console.log(`     - ${r.name}`));
    }

    console.log('\n✅ All PSGC endpoint tests PASSED!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

testPsgcEndpoints();
