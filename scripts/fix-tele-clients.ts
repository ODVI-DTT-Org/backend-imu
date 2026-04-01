/**
 * Fix Tele Clients - Add TP1 Visit touchpoints so TP2 Call becomes available
 *
 * Usage: npx tsx scripts/fix-tele-clients.ts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixTeleClients() {
  console.log('🔧 Fixing tele clients...\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find a caravan user to attribute TP1 touchpoints to
    const caravanResult = await client.query(
      "SELECT id FROM users WHERE role = 'caravan' LIMIT 1"
    );

    if (caravanResult.rows.length === 0) {
      console.log('❌ No caravan user found. Creating a test caravan user...');
      const passwordHash = await bcrypt.hash('password123', 10);
      const newCaravan = await client.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
         VALUES (gen_random_uuid(), 'caravan1@example.com', $1, 'Test', 'Caravan', 'caravan')
         RETURNING id`,
        [passwordHash]
      );
      caravanResult.rows = [newCaravan.rows[0]];
    }

    const caravanId = caravanResult.rows[0].id;
    console.log(`✅ Using caravan user: ${caravanId}`);

    // Get clients who have Call touchpoints (2,3,5,6) but no TP1
    const clientsResult = await client.query(`
      SELECT DISTINCT c.id, c.first_name, c.last_name
      FROM clients c
      INNER JOIN touchpoints t ON c.id = t.client_id
      WHERE t.touchpoint_number IN (2, 3, 5, 6)
      AND NOT EXISTS (
        SELECT 1 FROM touchpoints t2
        WHERE t2.client_id = c.id AND t2.touchpoint_number = 1
      )
      LIMIT 30
    `);

    console.log(`✅ Found ${clientsResult.rows.length} clients with Call touchpoints but no TP1`);

    // Check if user_id column exists
    const touchpointColumns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'touchpoints' AND column_name = 'user_id'
    `);
    const hasUserIdColumn = touchpointColumns.rows.length > 0;

    let createdCount = 0;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const clientRow of clientsResult.rows) {
      // Create TP1 (Visit) touchpoint
      await client.query(
        `INSERT INTO touchpoints (
          id, client_id, ${hasUserIdColumn ? 'user_id' : 'caravan_id'},
          touchpoint_number, type, date, reason, notes, status
        ) VALUES (
          gen_random_uuid(), $1, $2, 1, 'Visit', $3, $4, $5, $6
        )`,
        [
          clientRow.id,
          caravanId,
          thirtyDaysAgo,
          'Initial Visit',
          'Completed by caravan field agent',
          'Completed'
        ]
      );

      createdCount++;
      console.log(`  ✓ Created TP1 for ${clientRow.first_name} ${clientRow.last_name}`);
    }

    await client.query('COMMIT');

    console.log('\n✅ Fix completed successfully!\n');
    console.log('═══════════════════════════════════════');
    console.log('           SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`TP1 touchpoints created: ${createdCount}`);
    console.log('These clients should now appear in the tele user My Calls view.');
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Fix failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixTeleClients().catch(console.error);
