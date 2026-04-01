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
    
    // Get the raw bytes of Batanes assignments
    const result = await client.query(`
      SELECT municipality_id, 
             LENGTH(municipality_id) as len,
             OCTET_LENGTH(municipality_id) as byte_len,
             ENCODE(municipality_id, 'escape') as escaped,
             CONCAT('|', municipality_id, '|') as bordered
      FROM user_locations
      WHERE user_id = $1 AND municipality_id LIKE '%Sabtang%'
    `, [caravanId]);

    console.log('Raw data analysis:');
    result.rows.forEach(row => {
      console.log('\nmunicipality_id:', row.municipality_id);
      console.log('String length:', row.len);
      console.log('Byte length:', row.byte_len);
      console.log('Escaped:', row.escaped);
      console.log('Bordered:', row.bordered);
      
      // Show hex of each character
      console.log('Hex breakdown:');
      for (let i = 0; i < row.municipality_id.length; i++) {
        const char = row.municipality_id[i];
        const code = row.municipality_id.charCodeAt(i);
        const hex = code.toString(16).padStart(2, '0');
        console.log(`  [${i}] "${char}" = ${hex} (${code})`);
      }
    });

    // Now try the EXACT query with our test string
    console.log('\n\nTrying exact query with test string:');
    const testString = 'Batanes-Sabtang';
    const exactResult = await client.query(
      `SELECT id, municipality_id, OCTET_LENGTH(municipality_id) as byte_len
       FROM user_locations
       WHERE user_id = $1 AND municipality_id = $2`,
      [caravanId, testString]
    );
    console.log('Result with test string:', exactResult.rows.length, 'rows');

    // Try with TRIM
    console.log('\nTrying with TRIM:');
    const trimResult = await client.query(
      `SELECT id, municipality_id
       FROM user_locations
       WHERE user_id = $1 AND TRIM(municipality_id) = TRIM($2)`,
      [caravanId, testString]
    );
    console.log('Result with TRIM:', trimResult.rows.length, 'rows');

  } finally {
    client.release();
    await pool.end();
  }
}

checkSpaces().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
