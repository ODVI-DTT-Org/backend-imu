/**
 * Reimport Clients Script
 *
 * This script truncates the clients table and reimports all client data from CSV.
 *
 * Usage:
 *   npx tsx src/scripts/reimport-clients.ts
 */

import 'dotenv/config';
import { pool } from '../db/index.js';

async function reimportClients() {
  console.log('🔄 Starting client reimport...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Disable triggers for faster truncate
    await client.query('SET session_replication_role = replica;');

    // Truncate clients table (resets identity)
    console.log('🗑️  Truncating clients table...');
    await client.query('TRUNCATE TABLE clients CASCADE;');

    // Re-enable triggers
    await client.query('SET session_replication_role = DEFAULT;');

    await client.query('COMMIT');
    console.log('✅ Clients table truncated successfully');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error truncating clients table:', err);
    client.release();
    await pool.end();
    process.exit(1);
  }

  client.release();

  // Now run the import script
  console.log('\n📥 Starting CSV import...');
  await import('../scripts/import-clients-from-csv.js');
}

reimportClients().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
