// Test if the DELETE endpoint works
const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com') ? { rejectUnauthorized: false } : false
});

async function testDelete() {
  const client = await pool.connect();
  try {
    const caravanId = '33081a5a-51b4-4111-8642-52886c06fe30';
    const municipalityId = 'Batanes-Sabtang';

    console.log('Testing DELETE query...');
    console.log('caravanId:', caravanId);
    console.log('municipalityId:', municipalityId);
    console.log('municipalityId length:', municipalityId.length);
    console.log('municipalityId bytes:', Buffer.from(municipalityId).toString('hex'));

    // Exact same query as the DELETE endpoint
    const result = await client.query(
      'SELECT id FROM user_locations WHERE user_id = $1 AND municipality_id = $2 AND deleted_at IS NULL',
      [caravanId, municipalityId]
    );

    console.log('\nQuery result:', result.rows.length, 'rows');
    if (result.rows.length > 0) {
      console.log('Found ID:', result.rows[0].id);
    } else {
      console.log('NOT FOUND!');
      
      // Try to see what's close
      const similar = await client.query(`
        SELECT id, municipality_id, LEFT(municipality_id, 50) as preview,
               CONCAT('|', municipality_id, '|') as with_pipes,
               LENGTH(municipality_id) as len
        FROM user_locations
        WHERE user_id = $1 AND municipality_id LIKE '%Sabtang%'
      `, [caravanId]);
      
      console.log('\nSimilar assignments:');
      similar.rows.forEach(row => {
        console.log(`  "${row.municipality_id}" (len: ${row.len})`);
        console.log(`  ${row.with_pipes}`);
      });
    }

  } finally {
    client.release();
    await pool.end();
  }
}

testDelete().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
