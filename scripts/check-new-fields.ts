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

async function checkNewFields() {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(ext_name) as has_ext_name,
      COUNT(fullname) as has_fullname,
      COUNT(full_address) as has_full_address,
      COUNT(account_code) as has_account_code,
      COUNT(account_number) as has_account_number,
      COUNT(rank) as has_rank,
      COUNT("3g_company") as has_3g_company,
      COUNT("DMVAL_code") as has_dmval_code,
      COUNT(legacy_created_by) as has_legacy_created_by
    FROM clients
  `);

  console.log('=== New Fields Population ===');
  console.log('Total clients:', result.rows[0].total);
  console.log('Has ext_name:', result.rows[0].has_ext_name);
  console.log('Has fullname:', result.rows[0].has_fullname);
  console.log('Has full_address:', result.rows[0].has_full_address);
  console.log('Has account_code:', result.rows[0].has_account_code);
  console.log('Has account_number:', result.rows[0].has_account_number);
  console.log('Has rank:', result.rows[0].has_rank);
  console.log('Has 3g_company:', result.rows[0].has_3g_company);
  console.log('Has DMVAL_code:', result.rows[0].has_dmval_code);
  console.log('Has legacy_created_by:', result.rows[0].has_legacy_created_by);

  await pool.end();
}

checkNewFields().catch(console.error);
