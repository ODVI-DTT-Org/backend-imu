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
 * Seed data for Tele "My Calls" page testing
 *
 * Touchpoint sequence: Visit(1) → Call(2) → Call(3) → Visit(4) → Call(5) → Call(6) → Visit(7)
 *
 * Tele users can ONLY create Call touchpoints (2, 3, 5, 6)
 *
 * Golden Rule:
 * - TP2 (Call) requires TP1 (Visit) to be completed
 * - TP3 (Call) requires TP2 (Call) to be completed
 * - TP5 (Call) requires TP4 (Visit) to be completed
 * - TP6 (Call) requires TP5 (Call) to be completed
 */

async function seedTeleMyCallsData() {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    console.log('🌱 Seeding Tele My Calls test data...\n');

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

    // Get some existing clients to use
    const clientsResult = await dbClient.query(
      `SELECT id, first_name, last_name FROM clients ORDER BY created_at DESC LIMIT 50`
    );

    if (clientsResult.rows.length === 0) {
      console.log('❌ No clients found. Please run the main seed script first.');
      return;
    }

    const clients = clientsResult.rows;
    console.log(`📋 Found ${clients.length} clients to use\n`);

    // Define test scenarios with correct touchpoint patterns
    const scenarios = [
      {
        name: 'Scenario 1: Clients with 0 touchpoints (NOT callable)',
        description: 'Should show 0/7 progress, NO Call button',
        clientIndices: [0, 1],
        touchpoints: []
      },
      {
        name: 'Scenario 2: Clients with TP1 only (CALLABLE - TP2 next)',
        description: 'Should show 1/7 progress, Call button ENABLED',
        clientIndices: [2, 3],
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' }
        ]
      },
      {
        name: 'Scenario 3: Clients with TP1, TP2 (CALLABLE - TP3 next)',
        description: 'Should show 2/7 progress, Call button ENABLED',
        clientIndices: [4, 5],
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' }
        ]
      },
      {
        name: 'Scenario 4: Clients with TP1, TP2, TP3 (NOT callable - needs TP4)',
        description: 'Should show 3/7 progress, NO Call button (Caravan to visit)',
        clientIndices: [6, 7],
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Second follow-up', status: 'Undecided' }
        ]
      },
      {
        name: 'Scenario 5: Clients with TP1, TP2, TP3, TP4 (CALLABLE - TP5 next)',
        description: 'Should show 4/7 progress, Call button ENABLED',
        clientIndices: [8, 9],
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Second follow-up', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Interested' }
        ]
      },
      {
        name: 'Scenario 6: Clients with TP1, TP2, TP3, TP4, TP5 (CALLABLE - TP6 next)',
        description: 'Should show 5/7 progress, Call button ENABLED',
        clientIndices: [10, 11],
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Second follow-up', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Interested' },
          { touchpoint_number: 5, type: 'Call', reason: 'Third follow-up', status: 'Interested' }
        ]
      },
      {
        name: 'Scenario 7: Clients with TP1, TP2, TP3, TP4, TP5, TP6 (NOT callable - needs TP7)',
        description: 'Should show 6/7 progress, NO Call button (Caravan to visit)',
        clientIndices: [12, 13],
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Second follow-up', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Interested' },
          { touchpoint_number: 5, type: 'Call', reason: 'Third follow-up', status: 'Interested' },
          { touchpoint_number: 6, type: 'Call', reason: 'Fourth follow-up', status: 'Undecided' }
        ]
      },
      {
        name: 'Scenario 8: Clients with all 7 touchpoints (COMPLETE)',
        description: 'Should show 7/7 progress, NO Call button',
        clientIndices: [14, 15],
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Completed' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Completed' },
          { touchpoint_number: 3, type: 'Call', reason: 'Second follow-up', status: 'Completed' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Completed' },
          { touchpoint_number: 5, type: 'Call', reason: 'Third follow-up', status: 'Completed' },
          { touchpoint_number: 6, type: 'Call', reason: 'Fourth follow-up', status: 'Completed' },
          { touchpoint_number: 7, type: 'Visit', reason: 'Final visit', status: 'Completed' }
        ]
      },
      {
        name: 'Scenario 9: Clients with TP1, TP4 (skip pattern - NOT callable)',
        description: 'Should show 2/7 progress, NO Call button (missing TP2, TP3)',
        clientIndices: [16],
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Interested' }
        ]
      },
      {
        name: 'Scenario 10: Clients with TP1, TP2, TP4 (missing TP3 - NOT callable)',
        description: 'Should show 3/7 progress, NO Call button (TP3 missing, TP4 done)',
        clientIndices: [17],
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Interested' }
        ]
      }
    ];

    let clientIndex = 0;

    for (const scenario of scenarios) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📋 ${scenario.name}`);
      console.log(`   ${scenario.description}`);
      console.log(`${'='.repeat(80)}`);

      for (const clientIdx of scenario.clientIndices) {
        if (clientIndex >= clients.length) {
          console.log(`⚠️  No more clients available, skipping`);
          break;
        }

        const client = clients[clientIndex];
        console.log(`\n👤 Client: ${client.first_name} ${client.last_name}`);

        for (const tp of scenario.touchpoints) {
          const touchpoint = await dbClient.query(
            `INSERT INTO touchpoints (
              id, client_id, user_id, touchpoint_number, type, date,
              reason, status, notes
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
            ) RETURNING id, touchpoint_number, type`,
            [
              client.id,
              teleUserId,
              tp.touchpoint_number,
              tp.type,
              new Date().toISOString().split('T')[0], // today's date
              tp.reason,
              tp.status,
              `Test touchpoint for ${scenario.name}`
            ]
          );

          const nextCallNumber = getNextCallNumber(scenario.touchpoints, tp.touchpoint_number);
          const isCallable = nextCallNumber !== null;
          const progress = scenario.touchpoints.length;

          console.log(`   ✓ TP${tp.touchpoint_number} (${tp.type}) - ${tp.reason}`);
          console.log(`     → Progress: ${progress}/7, Next Call: TP${nextCallNumber || 'N/A'}, Callable: ${isCallable ? 'YES ✅' : 'NO ❌'}`);
        }

        clientIndex++;
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ Tele My Calls test data seeded successfully!`);
    console.log(`📊 Total clients processed: ${clientIndex}`);
    console.log(`${'='.repeat(80)}\n`);

    // Summary table
    console.log('\n📊 Expected Results Summary:\n');
    console.log('| Scenario | Progress | to_call | Call Button | Next TP |');
    console.log('|----------|----------|--------|-------------|---------|');
    console.log('| 1: 0 TP  | 0/7      | false  | NO          | N/A     |');
    console.log('| 2: TP1   | 1/7      | true   | YES ✅      | TP2     |');
    console.log('| 3: TP1-2 | 2/7      | true   | YES ✅      | TP3     |');
    console.log('| 4: TP1-3 | 3/7      | false  | NO          | N/A     |');
    console.log('| 5: TP1-4 | 4/7      | true   | YES ✅      | TP5     |');
    console.log('| 6: TP1-5 | 5/7      | true   | YES ✅      | TP6     |');
    console.log('| 7: TP1-6 | 6/7      | false  | NO          | N/A     |');
    console.log('| 8: All   | 7/7      | false  | NO          | Done    |');
    console.log('| 9: Skip   | 2/7      | false  | NO          | N/A     |');
    console.log('| 10: Skip  | 3/7      | false  | NO          | N/A     |');

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

/**
 * Helper function to determine the next Call touchpoint number
 * based on the golden rule
 */
function getNextCallNumber(existingTouchpoints: Array<{touchpoint_number: number}>, currentNumber: number): number | null {
  const existingNumbers = existingTouchpoints.map(t => t.touchpoint_number);

  // TP2 (Call) is available if TP1 (Visit) is completed
  if (currentNumber === 1 && !existingNumbers.includes(2)) {
    return 2;
  }
  // TP3 (Call) is available if TP2 (Call) is completed
  if (currentNumber === 2 && !existingNumbers.includes(3)) {
    return 3;
  }
  // TP5 (Call) is available if TP4 (Visit) is completed
  if (currentNumber === 4 && !existingNumbers.includes(5)) {
    return 5;
  }
  // TP6 (Call) is available if TP5 (Call) is completed
  if (currentNumber === 5 && !existingNumbers.includes(6)) {
    return 6;
  }

  // After the last touchpoint, check what's next
  if (existingNumbers.includes(1) && !existingNumbers.includes(2)) return 2;
  if (existingNumbers.includes(2) && !existingNumbers.includes(3)) return 3;
  if (existingNumbers.includes(4) && !existingNumbers.includes(5)) return 5;
  if (existingNumbers.includes(5) && !existingNumbers.includes(6)) return 6;

  return null; // All call touchpoints done or need visit touchpoint first
}

// Run the seed
seedTeleMyCallsData()
  .then(() => pool.end())
  .catch(console.error);
