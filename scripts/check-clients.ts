/**
 * Check current clients in database
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
});

async function checkClients() {
  try {
    const result = await pool.query(`
      SELECT id, first_name, last_name, email, client_type, created_at
      FROM clients
      ORDER BY created_at DESC
      LIMIT 20
    `);

    console.log('Current clients in database:');
    console.table(result.rows);

    // Check for test/sample emails
    const testClients = await pool.query(`
      SELECT id, first_name, last_name, email
      FROM clients
      WHERE email LIKE '%test%' OR email LIKE '%sample%' OR email LIKE '%@example.com'
      ORDER BY created_at DESC
    `);

    if (testClients.rows.length > 0) {
      console.log('\nTest/sample clients found:');
      console.table(testClients.rows);
    } else {
      console.log('\nNo test/sample clients found.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkClients();
