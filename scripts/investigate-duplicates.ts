/**
 * Investigate duplicate records in clients table
 */

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
    : undefined,
});

async function investigate() {
  // Total count
  const countResult = await pool.query('SELECT COUNT(*) as count FROM clients');
  console.log('Total clients:', countResult.rows[0].count);

  // Check for duplicates by first_name, last_name
  const dupResult = await pool.query(`
    SELECT first_name, last_name, COUNT(*) as count
    FROM clients
    WHERE first_name IS NOT NULL AND last_name IS NOT NULL
    GROUP BY first_name, last_name
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `);

  console.log('\n=== Duplicate Names (first + last) ===');
  console.log('Found', dupResult.rows.length, 'duplicate name combinations');
  dupResult.rows.forEach((row: any) => {
    console.log(`${row.first_name} ${row.last_name}: ${row.count} records`);
  });

  // Check for duplicates by phone
  const phoneDupResult = await pool.query(`
    SELECT phone, COUNT(*) as count
    FROM clients
    WHERE phone IS NOT NULL AND phone != '' AND phone != 'N/A' AND phone != 'NO CONTACT NUMBER'
    GROUP BY phone
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 10
  `);

  console.log('\n=== Duplicate Phone Numbers ===');
  console.log('Found', phoneDupResult.rows.length, 'duplicate phone numbers');
  phoneDupResult.rows.forEach((row: any) => {
    console.log(`${row.phone}: ${row.count} records`);
  });

  // Check created_at timestamps
  const timeResult = await pool.query(`
    SELECT
      DATE_TRUNC('minute', created_at) as minute,
      COUNT(*) as count
    FROM clients
    GROUP BY minute
    ORDER BY minute DESC
    LIMIT 10
  `);

  console.log('\n=== Import Batches (by created_at minute) ===');
  timeResult.rows.forEach((row: any) => {
    console.log(`${row.minute}: ${row.count} records`);
  });

  // Count distinct first_name + last_name
  const distinctResult = await pool.query(`
    SELECT COUNT(DISTINCT CONCAT(first_name, '|', last_name)) as distinct_names
    FROM clients
    WHERE first_name IS NOT NULL AND last_name IS NOT NULL
  `);

  console.log('\n=== Distinct Names vs Total ===');
  console.log('Distinct names:', distinctResult.rows[0].distinct_names);
  console.log('Total records:', countResult.rows[0].count);
  console.log('Possible duplicates:', countResult.rows[0].count - distinctResult.rows[0].distinct_names);

  await pool.end();
}

investigate().catch(console.error);
