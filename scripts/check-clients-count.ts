import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkClients() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT COUNT(*) as count FROM clients');
    console.log('Total clients in database:', result.rows[0].count);
  } finally {
    client.release();
    await pool.end();
  }
}

checkClients();
