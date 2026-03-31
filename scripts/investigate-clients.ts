/**
 * Investigate client data distribution
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
  // Check total count
  const countResult = await pool.query('SELECT COUNT(*) as count FROM clients');
  console.log('Total clients:', countResult.rows[0].count);

  // Check how many have the new CSV-only fields (like DMVAL_code which is only in the CSV)
  const csvDataResult = await pool.query(`
    SELECT
      COUNT(*) as count,
      COUNT(CASE WHEN "DMVAL_code" IS NOT NULL THEN 1 END) as has_dmval,
      COUNT(CASE WHEN "3g_company" IS NOT NULL THEN 1 END) as has_3g,
      COUNT(CASE WHEN rank IS NOT NULL THEN 1 END) as has_rank,
      MIN(created_at) as oldest,
      MAX(created_at) as newest
    FROM clients
  `);

  console.log('\n=== Data Analysis ===');
  console.log('Has DMVAL_code (CSV data):', csvDataResult.rows[0].has_dmval);
  console.log('Has 3G company (CSV data):', csvDataResult.rows[0].has_3g);
  console.log('Has rank (CSV data):', csvDataResult.rows[0].has_rank);
  console.log('Oldest created_at:', csvDataResult.rows[0].oldest);
  console.log('Newest created_at:', csvDataResult.rows[0].newest);

  // Check distribution of legacy_created_by
  const createdByResult = await pool.query(`
    SELECT
      legacy_created_by,
      COUNT(*) as count
    FROM clients
    GROUP BY legacy_created_by
    ORDER BY count DESC
    LIMIT 10
  `);

  console.log('\n=== Created By Distribution ===');
  createdByResult.rows.forEach((row: any) => {
    console.log(`${row.legacy_created_by || 'NULL'}: ${row.count}`);
  });

  // Check for duplicate phone numbers (possible indication of duplicate imports)
  const dupResult = await pool.query(`
    SELECT phone, COUNT(*) as count
    FROM clients
    WHERE phone IS NOT NULL
    GROUP BY phone
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 10
  `);

  console.log('\n=== Possible Duplicates (same phone) ===');
  if (dupResult.rows.length > 0) {
    dupResult.rows.forEach((row: any) => {
      console.log(`${row.phone}: ${row.count} records`);
    });
  } else {
    console.log('No duplicates found by phone number');
  }

  // Check client types
  const typeResult = await pool.query(`
    SELECT client_type, COUNT(*) as count
    FROM clients
    GROUP BY client_type
    ORDER BY client_type
  `);

  console.log('\n=== Client Types ===');
  typeResult.rows.forEach((row: any) => {
    console.log(`${row.client_type || 'NULL'}: ${row.count}`);
  });

  await pool.end();
}

investigate().catch(console.error);
