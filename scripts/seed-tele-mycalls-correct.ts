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

/**
 * Seed Tele My Calls test data with CORRECT touchpoint sequence
 *
 * CORRECT SEQUENCE:
 * - TP1: Call (Tele)
 * - TP2: Call (Tele)
 * - TP3: Visit (Caravan)
 * - TP4: Call (Tele)
 * - TP5: Call (Tele)
 * - TP6: Visit (Caravan)
 * - TP7: Completed
 *
 * Tele users can ONLY create Call touchpoints: TP1, TP2, TP4, TP5
 * Caravan users create Visit touchpoints: TP3, TP6
 */

async function seedTeleMyCallsDataCorrect() {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    console.log('🌱 Seeding Tele My Calls test data with CORRECT sequence...\n');

    // Get or create a Tele user
    const teleUserResult = await dbClient.query(
      `SELECT id, email, first_name, last_name FROM users WHERE role = 'tele' LIMIT 1`
    );

    let teleUserId;
    if (teleUserResult.rows.length === 0) {
      const teleUser = await dbClient.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
         VALUES (gen_random_uuid(), 'tele@imu.com', '$2a$10$dummy', 'Tele', 'User', 'tele')
         RETURNING id`
      );
      teleUserId = teleUser.rows[0].id;
      console.log('✅ Created Tele user');
    } else {
      teleUserId = teleUserResult.rows[0].id;
      console.log('✅ Using existing Tele user');
    }

    // Clean up existing test data
    await dbClient.query(`DELETE FROM touchpoints WHERE user_id = $1`, [teleUserId]);
    console.log('🧹 Cleaned up existing touchpoints for Tele user\n');

    // Get existing clients
    const clientsResult = await dbClient.query(
      `SELECT id, first_name, last_name FROM clients ORDER BY created_at DESC LIMIT 200`
    );

    if (clientsResult.rows.length === 0) {
      console.log('❌ No clients found. Please run the main seed script first.');
      return;
    }

    const clients = clientsResult.rows;
    const clientCount = Math.min(clients.length, 200);
    console.log(`📋 Found ${clientCount} clients to use\n`);

    // Define scenarios with CORRECT touchpoint types
    const scenarios = [
      {
        name: '0 touchpoints (new clients)',
        description: 'Should show 0/7 progress, next: TP1 (Call by Tele)',
        count: 60,
        touchpoints: []
      },
      {
        name: 'TP1 only (Call by Tele)',
        description: 'Should show 1/7 progress, next: TP2 (Call by Tele)',
        count: 30,
        touchpoints: [
          { touchpoint_number: 1, type: 'Call', reason: 'Initial call', status: 'Interested' }
        ]
      },
      {
        name: 'TP1, TP2 (both Call by Tele)',
        description: 'Should show 2/7 progress, next: TP3 (Visit by Caravan)',
        count: 24,
        touchpoints: [
          { touchpoint_number: 1, type: 'Call', reason: 'Initial call', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' }
        ]
      },
      {
        name: 'TP1, TP2, TP3 (waiting for TP4)',
        description: 'Should show 3/7 progress, next: TP4 (Call by Tele)',
        count: 20,
        touchpoints: [
          { touchpoint_number: 1, type: 'Call', reason: 'Initial call', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Visit', reason: 'Site visit', status: 'Interested' }
        ]
      },
      {
        name: 'TP1, TP2, TP3, TP4 (waiting for TP5)',
        description: 'Should show 4/7 progress, next: TP5 (Call by Tele)',
        count: 20,
        touchpoints: [
          { touchpoint_number: 1, type: 'Call', reason: 'Initial call', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Visit', reason: 'Site visit', status: 'Interested' },
          { touchpoint_number: 4, type: 'Call', reason: 'Third call', status: 'Interested' }
        ]
      },
      {
        name: 'TP1, TP2, TP3, TP4, TP5 (waiting for TP6)',
        description: 'Should show 5/7 progress, next: TP6 (Visit by Caravan)',
        count: 16,
        touchpoints: [
          { touchpoint_number: 1, type: 'Call', reason: 'Initial call', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Visit', reason: 'Site visit', status: 'Interested' },
          { touchpoint_number: 4, type: 'Call', reason: 'Third call', status: 'Interested' },
          { touchpoint_number: 5, type: 'Call', reason: 'Fourth call', status: 'Interested' }
        ]
      },
      {
        name: 'TP1, TP2, TP3, TP4, TP5, TP6 (complete)',
        description: 'Should show 6/7 progress, complete',
        count: 16,
        touchpoints: [
          { touchpoint_number: 1, type: 'Call', reason: 'Initial call', status: 'Completed' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Completed' },
          { touchpoint_number: 3, type: 'Visit', reason: 'Site visit', status: 'Completed' },
          { touchpoint_number: 4, type: 'Call', reason: 'Third call', status: 'Completed' },
          { touchpoint_number: 5, type: 'Call', reason: 'Fourth call', status: 'Completed' },
          { touchpoint_number: 6, type: 'Visit', reason: 'Final visit', status: 'Completed' }
        ]
      },
      {
        name: 'All 7 touchpoints (complete)',
        description: 'Should show 7/7 progress, complete',
        count: 10,
        touchpoints: [
          { touchpoint_number: 1, type: 'Call', reason: 'Initial call', status: 'Completed' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Completed' },
          { touchpoint_number: 3, type: 'Visit', reason: 'Site visit', status: 'Completed' },
          { touchpoint_number: 4, type: 'Call', reason: 'Third call', status: 'Completed' },
          { touchpoint_number: 5, type: 'Call', reason: 'Fourth call', status: 'Completed' },
          { touchpoint_number: 6, type: 'Visit', reason: 'Final visit', status: 'Completed' },
          { touchpoint_number: 7, type: 'Visit', reason: 'Completion visit', status: 'Completed' }
        ]
      },
      {
        name: 'Edge case: TP1, TP3 (skipped TP2)',
        description: 'Should show 2/7 progress, NOT callable (missing TP2)',
        count: 2,
        touchpoints: [
          { touchpoint_number: 1, type: 'Call', reason: 'Initial call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Visit', reason: 'Site visit', status: 'Interested' }
        ]
      },
      {
        name: 'Edge case: TP1, TP2, TP4 (skipped TP3)',
        description: 'Should show 3/7 progress, NOT callable (missing TP3)',
        count: 2,
        touchpoints: [
          { touchpoint_number: 1, type: 'Call', reason: 'Initial call', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 4, type: 'Call', reason: 'Third call', status: 'Interested' }
        ]
      }
    ];

    let clientIndex = 0;
    const stats: { [key: string]: number } = {};

    for (const scenario of scenarios) {
      console.log(`${'='.repeat(80)}`);
      console.log(`📋 ${scenario.name}`);
      console.log(`   ${scenario.description}`);
      console.log(`   Target: ${scenario.count} clients`);
      console.log(`${'='.repeat(80)}`);

      stats[scenario.name] = 0;

      for (let i = 0; i < scenario.count && clientIndex < clientCount; i++, clientIndex++) {
        const client = clients[clientIndex];

        for (const tp of scenario.touchpoints) {
          await dbClient.query(
            `INSERT INTO touchpoints (
              id, client_id, user_id, touchpoint_number, type, date,
              reason, status, notes
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
            )`,
            [
              client.id,
              teleUserId,
              tp.touchpoint_number,
              tp.type,
              new Date().toISOString().split('T')[0],
              tp.reason,
              tp.status,
              `Test touchpoint for ${scenario.name}`
            ]
          );
        }

        stats[scenario.name]++;
      }

      console.log(`✅ Created ${stats[scenario.name]} clients\n`);
    }

    console.log(`${'='.repeat(80)}`);
    console.log(`✅ Tele My Calls test data seeded successfully!`);
    console.log(`📊 Total clients processed: ${clientIndex}`);
    console.log(`${'='.repeat(80)}\n`);

    // Print statistics
    console.log('\n📊 Distribution Summary:\n');
    console.log('| Pattern | Count | Callable | Next TP |');
    console.log('|---------|-------|----------|---------|');

    const callablePatterns: { [key: string]: string } = {
      '0 touchpoints': 'YES (TP1)',
      'TP1 only': 'YES (TP2)',
      'TP1, TP2': 'NO (TP3 Visit)',
      'TP1, TP2, TP3': 'YES (TP4)',
      'TP1, TP2, TP3, TP4': 'YES (TP5)',
      'TP1, TP2, TP3, TP4, TP5': 'NO (TP6 Visit)',
      'TP1, TP2, TP3, TP4, TP5, TP6': 'NO (Complete)',
      'All 7 touchpoints': 'NO (Complete)',
      'Edge case: TP1, TP3': 'NO (Skip)',
      'Edge case: TP1, TP2, TP4': 'NO (Skip)'
    };

    for (const scenario of scenarios) {
      const count = stats[scenario.name] || 0;
      const callable = callablePatterns[scenario.name] || 'UNKNOWN';
      console.log(`| ${scenario.name.padEnd(30)} | ${count.toString().padStart(5)} | ${callable.padEnd(14)} |`);
    }

    await dbClient.query('COMMIT');
    console.log('\n✅ Seed data committed successfully!');

  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    dbClient.release();
  }
}

// Run the seed
seedTeleMyCallsDataCorrect()
  .then(() => pool.end())
  .catch(console.error);
