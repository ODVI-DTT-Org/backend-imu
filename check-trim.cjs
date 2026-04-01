const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com') ? { rejectUnauthorized: false } : false
});

async function checkSpaces() {
  const client = await pool.connect();
  try {
    const caravanId = '33081a5a-51b4-4111-8642-52886c06fe30';

    // Get Batanes assignment
    const result = await client.query(`
      SELECT municipality_id,
             LENGTH(municipality_id) as len,
             OCTET_LENGTH(municipality_id) as byte_len,
             CONCAT('|', municipality_id, '|') as bordered
      FROM user_locations
      WHERE user_id = $1 AND municipality_id LIKE '%Sabtang%'
    `, [caravanId]);

    console.log('Raw data:');
    result.rows.forEach(row => {
      console.log('ID:', row.municipality_id);
      console.log('Length:', row.len);
      console.log('Bordered:', row.bordered);
    });

    // Try with TRIM
    const testString = 'Batanes-Sabtang';
    console.log('\nTesting query with TRIM:');
    console.log('Our string:', `"${testString}"`);

    const trimResult = await client.query(
      `SELECT id, municipality_id
       FROM user_locations
       WHERE user_id = $1 AND TRIM(municipality_id) = TRIM($2)`,
      [caravanId, testString]
    );
    console.log('Found with TRIM:', trimResult.rows.length, 'rows');

    if (trimResult.rows.length > 0) {
      console.log('\nSUCCESS! The issue is trailing/leading spaces');
      console.log('Found ID:', trimResult.rows[0].id);
    } else {
      console.log('\nStill not found - checking all municipalities...');
      const allResult = await client.query(
        `SELECT municipality_id, CONCAT('|', municipality_id, '|') as bordered
         FROM user_locations
         WHERE user_id = $1
         LIMIT 20`,
        [caravanId]
      );
      console.log('First 20 municipalities:');
      allResult.rows.forEach(row => {
        console.log(`  ${row.bordered}`);
      });
    }

  } finally {
    client.release();
    await pool.end();
  }
}

checkSpaces().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
