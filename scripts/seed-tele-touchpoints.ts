/**
 * Seed Tele Touchpoints
 * Creates touchpoints for tele user testing
 *
 * Usage: npx tsx scripts/seed-tele-touchpoints.ts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false,
});

// Tele touchpoint numbers (only calls)
const TELE_TOUCHPOINT_NUMBERS = [2, 3, 5, 6];

const TOUCHPOINT_REASONS = [
  'Initial Contact',
  'Follow-up Call',
  'Document Verification',
  'Loan Application Follow-up',
  'Payment Reminder',
  'Account Update',
  'Referral Follow-up',
  'Complaint Resolution',
  'Product Information',
  'Contract Review',
  'Document Submission Reminder',
  'Appointment Scheduling',
  'Status Update',
  'Feedback Collection',
  'Renewal Discussion',
];

const CALL_NOTES = [
  'Client interested in loan products',
  'Follow-up scheduled for next week',
  'Client requested additional information',
  'Documents pending submission',
  'Payment arrangement discussed',
  'Client unavailable, left message',
  'Successful contact, positive response',
  'Client considering options',
  'Clarification needed on requirements',
  'Appointment confirmed',
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seedTeleTouchpoints() {
  console.log('🌱 Seeding tele touchpoints...\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find or create tele user
    let teleUser = await client.query(
      "SELECT id, email FROM users WHERE email = $1",
      ['teleuser@example.com']
    );

    if (teleUser.rows.length === 0) {
      console.log('❌ Tele user not found. Please create teleuser@example.com first.');
      console.log('You can create it via the Users page in the admin dashboard.');
      await client.query('ROLLBACK');
      return;
    }

    const teleUserId = teleUser.rows[0].id;
    console.log(`✅ Found tele user: ${teleUser.rows[0].email} (${teleUserId})`);

    // Get existing clients
    const clientsResult = await client.query(
      `SELECT id, first_name, last_name FROM clients ORDER BY RANDOM() LIMIT 50`
    );

    if (clientsResult.rows.length === 0) {
      console.log('❌ No clients found. Please seed clients first.');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`✅ Found ${clientsResult.rows.length} clients`);

    // Check if user_id column exists in touchpoints table
    const touchpointColumns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'touchpoints' AND column_name = 'user_id'
    `);
    const hasUserIdColumn = touchpointColumns.rows.length > 0;

    // Check if status column exists
    const statusColumnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'touchpoints' AND column_name = 'status'
    `);
    const hasStatusColumn = statusColumnCheck.rows.length > 0;

    // Generate touchpoints
    console.log('\n📋 Creating touchpoints...\n');
    let touchpointCount = 0;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const clientRow of clientsResult.rows) {
      // Each client gets 1-4 tele touchpoints (call types only: 2, 3, 5, 6)
      const numTouchpoints = randomInt(1, 4);
      const selectedNumbers = [...TELE_TOUCHPOINT_NUMBERS]
        .sort(() => Math.random() - 0.5)
        .slice(0, numTouchpoints)
        .sort((a, b) => a - b);

      for (const touchpointNumber of selectedNumbers) {
        const touchpointDate = randomDate(thirtyDaysAgo, now);
        const status = hasStatusColumn ? randomElement(['Interested', 'Undecided', 'Not Interested', 'Completed']) : null;

        if (hasUserIdColumn) {
          // Use new schema with user_id
          await client.query(
            `INSERT INTO touchpoints (
              id, client_id, user_id, touchpoint_number, type, date, reason, notes
              ${hasStatusColumn ? ', status' : ''}
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
              ${hasStatusColumn ? ', $8' : ''}
            )`,
            hasStatusColumn
              ? [clientRow.id, teleUserId, touchpointNumber, 'Call', touchpointDate,
                  randomElement(TOUCHPOINT_REASONS), randomElement(CALL_NOTES), status]
              : [clientRow.id, teleUserId, touchpointNumber, 'Call', touchpointDate,
                  randomElement(TOUCHPOINT_REASONS), randomElement(CALL_NOTES)]
          );
        } else {
          // Use old schema with caravan_id
          await client.query(
            `INSERT INTO touchpoints (
              id, client_id, caravan_id, touchpoint_number, type, date, reason, notes
              ${hasStatusColumn ? ', status' : ''}
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7
              ${hasStatusColumn ? ', $8' : ''}
            )`,
            hasStatusColumn
              ? [clientRow.id, teleUserId, touchpointNumber, 'Call', touchpointDate,
                  randomElement(TOUCHPOINT_REASONS), randomElement(CALL_NOTES), status]
              : [clientRow.id, teleUserId, touchpointNumber, 'Call', touchpointDate,
                  randomElement(TOUCHPOINT_REASONS), randomElement(CALL_NOTES)]
          );
        }

        touchpointCount++;
        console.log(`  ✓ Touchpoint #${touchpointNumber} (Call) for ${clientRow.first_name} ${clientRow.last_name}`);
      }
    }

    await client.query('COMMIT');

    console.log('\n✅ Seeding completed successfully!\n');
    console.log('═══════════════════════════════════════');
    console.log('           SEEDING SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Tele User:    ${teleUser.rows[0].email}`);
    console.log(`Clients:      ${clientsResult.rows.length}`);
    console.log(`Touchpoints:  ${touchpointCount}`);
    console.log('═══════════════════════════════════════\n');

    // Verify counts
    const verifyResult = await client.query(`
      SELECT
        COUNT(*) as total_touchpoints,
        COUNT(*) FILTER (WHERE type = 'Call') as call_touchpoints,
        COUNT(*) FILTER (WHERE touchpoint_number = ANY(ARRAY[2,3,5,6])) as tele_touchpoints
      FROM touchpoints
      WHERE ${hasUserIdColumn ? 'user_id' : 'caravan_id'} = $1
    `, [teleUserId]);

    console.log('Database verification for tele user:');
    console.table(verifyResult.rows[0]);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the seeder
seedTeleTouchpoints().catch(console.error);
