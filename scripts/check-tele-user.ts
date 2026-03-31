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

async function checkTeleUser() {
  const result = await pool.query(
    `SELECT email, first_name, last_name, role FROM users WHERE role = 'tele' LIMIT 1`
  );

  if (result.rows.length > 0) {
    console.log('Tele user found:');
    console.log(result.rows[0]);
  } else {
    console.log('No tele user found');
  }

  await pool.end();
}

checkTeleUser().catch(console.error);
