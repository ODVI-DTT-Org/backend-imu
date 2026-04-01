/**
 * Remove test/sample clients from database
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

async function cleanTestClients() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Count test clients before deletion
    const countResult = await client.query(`
      SELECT COUNT(*) as count
      FROM clients
      WHERE email LIKE '%test.com%' OR email LIKE '%example.com%'
    `);
    const count = parseInt(countResult.rows[0].count);
    console.log(`Found ${count} test clients to delete`);

    if (count === 0) {
      console.log('No test clients found. Nothing to delete.');
      await client.query('ROLLBACK');
      return;
    }

    // Get list of test client IDs
    const testClientIds = await client.query(`
      SELECT id FROM clients
      WHERE email LIKE '%test.com%' OR email LIKE '%example.com%'
    `);

    const clientIds = testClientIds.rows.map(r => r.id);

    // Delete touchpoints for these clients
    const touchpointResult = await client.query(`
      DELETE FROM touchpoints
      WHERE client_id = ANY($1)
    `, [clientIds]);
    console.log(`Deleted ${touchpointResult.rowCount} touchpoints`);

    // Delete itineraries for these clients
    const itineraryResult = await client.query(`
      DELETE FROM itineraries
      WHERE client_id = ANY($1)
    `, [clientIds]);
    console.log(`Deleted ${itineraryResult.rowCount} itineraries`);

    // Delete approvals for these clients
    const approvalResult = await client.query(`
      DELETE FROM approvals
      WHERE client_id = ANY($1)
    `, [clientIds]);
    console.log(`Deleted ${approvalResult.rowCount} approvals`);

    // Delete the clients
    const clientResult = await client.query(`
      DELETE FROM clients
      WHERE email LIKE '%test.com%' OR email LIKE '%example.com%'
    `);
    console.log(`Deleted ${clientResult.rowCount} clients`);

    await client.query('COMMIT');

    console.log('\n✅ Test clients cleaned successfully!');

    // Show remaining clients
    const remainingResult = await client.query(`
      SELECT COUNT(*) as count FROM clients
    `);
    console.log(`Remaining clients: ${remainingResult.rows[0].count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Cleanup failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanTestClients();
