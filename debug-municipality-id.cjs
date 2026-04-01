const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com') ? { rejectUnauthorized: false } : false
});

async function debugMunicipalityIds() {
  const client = await pool.connect();
  try {
    const caravanId = '33081a5a-51b4-4111-8642-52886c06fe30';
    
    // Get all municipality_ids for this caravan
    const result = await client.query(`
      SELECT municipality_id, LEFT(municipality_id, 50) as municipality_id_preview
      FROM user_locations
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY municipality_id
      LIMIT 10
    `, [caravanId]);

    console.log('Total assignments:', result.rows.length);
    console.log('\nSample municipality_ids:');
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. "${row.municipality_id}" (length: ${row.municipality_id.length})`);
      console.log(`   Preview: "${row.municipality_id_preview}"`);
    });

    // Check specifically for Batanes
    const batanesResult = await client.query(`
      SELECT municipality_id, LENGTH(municipality_id) as id_length, 
             CONCAT('|', municipality_id, '|') as with_pipes
      FROM user_locations
      WHERE user_id = $1 AND municipality_id LIKE '%Batanes%'
      ORDER BY municipality_id
      LIMIT 5
    `, [caravanId]);

    console.log('\nBatanes-related assignments:');
    if (batanesResult.rows.length === 0) {
      console.log('  No Batanes assignments found');
    } else {
      batanesResult.rows.forEach(row => {
        console.log(`  "${row.municipality_id}" (${row.id_length} chars)`);
        console.log(`  ${row.with_pipes}`);
      });
    }

    // Try to find "Batanes-Sabtang"
    const specificResult = await client.query(`
      SELECT * FROM user_locations
      WHERE user_id = $1 AND municipality_id = $2
    `, [caravanId, 'Batanes-Sabtang']);

    console.log('\nSearching for "Batanes-Sabtang":');
    console.log('  Found:', specificResult.rows.length > 0 ? 'YES' : 'NO');
    if (specificResult.rows.length === 0) {
      console.log('  This municipality_id is NOT in the database');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

debugMunicipalityIds().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
