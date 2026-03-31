/**
 * Check clients table columns
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

async function checkColumns() {
  const result = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'clients'
    ORDER BY column_name;
  `);

  console.log('=== Clients Table Columns ===');
  console.log(`Total columns: ${result.rows.length}\n`);

  result.rows.forEach((row, index) => {
    console.log(`${index + 1}. ${row.column_name}: ${row.data_type}`);
  });

  await pool.end();
}

checkColumns().catch(console.error);
