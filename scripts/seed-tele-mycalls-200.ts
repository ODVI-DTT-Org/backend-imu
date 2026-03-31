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
 * Seed 200 Tele "My Calls" test data with realistic distribution
 *
 * Distribution strategy:
 * - 30%: 0 touchpoints (new clients)
 * - 15%: TP1 only (just started, callable for TP2)
 * - 12%: TP1, TP2 (callable for TP3)
 * - 10%: TP1, TP2, TP3 (waiting for TP4 visit)
 * - 10%: TP1, TP2, TP3, TP4 (callable for TP5)
 * - 8%: TP1, TP2, TP3, TP4, TP5 (callable for TP6)
 * - 8%: TP1, TP2, TP3, TP4, TP5, TP6 (waiting for TP7 visit)
 * - 5%: All 7 touchpoints (complete)
 * - 2%: Edge cases (skip patterns)
 */

interface TouchpointData {
  touchpoint_number: number;
  type: 'Visit' | 'Call';
  reason: string;
  status: string;
}

async function seedTeleMyCallsData200() {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    console.log('🌱 Seeding 200 Tele My Calls test data...\n');

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

    // Get existing clients - need at least 200, if not enough we'll use what we have
    const clientsResult = await dbClient.query(
      `SELECT id, first_name, last_name FROM clients ORDER BY created_at DESC LIMIT 200`
    );

    if (clientsResult.rows.length === 0) {
      console.log('❌ No clients found. Please run the main seed script first.');
      return;
    }

    const clients = clientsResult.rows;
    const clientCount = clients.length;
    console.log(`📋 Found ${clientCount} clients to use\n`);

    // Define touchpoint patterns
    const touchpointPatterns: { name: string; touchpoints: TouchpointData[]; percentage: number }[] = [
      {
        name: '0 touchpoints (new clients)',
        touchpoints: [],
        percentage: 30
      },
      {
        name: 'TP1 only (callable for TP2)',
        touchpoints: [{ touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' }],
        percentage: 15
      },
      {
        name: 'TP1, TP2 (callable for TP3)',
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' }
        ],
        percentage: 12
      },
      {
        name: 'TP1, TP2, TP3 (waiting for TP4 visit)',
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Second follow-up', status: 'Undecided' }
        ],
        percentage: 10
      },
      {
        name: 'TP1, TP2, TP3, TP4 (callable for TP5)',
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Second follow-up', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Interested' }
        ],
        percentage: 10
      },
      {
        name: 'TP1, TP2, TP3, TP4, TP5 (callable for TP6)',
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Second follow-up', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Interested' },
          { touchpoint_number: 5, type: 'Call', reason: 'Third follow-up', status: 'Interested' }
        ],
        percentage: 8
      },
      {
        name: 'TP1, TP2, TP3, TP4, TP5, TP6 (waiting for TP7 visit)',
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Second follow-up', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Interested' },
          { touchpoint_number: 5, type: 'Call', reason: 'Third follow-up', status: 'Interested' },
          { touchpoint_number: 6, type: 'Call', reason: 'Fourth follow-up', status: 'Undecided' }
        ],
        percentage: 8
      },
      {
        name: 'All 7 touchpoints (complete)',
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Completed' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Completed' },
          { touchpoint_number: 3, type: 'Call', reason: 'Second follow-up', status: 'Completed' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Completed' },
          { touchpoint_number: 5, type: 'Call', reason: 'Third follow-up', status: 'Completed' },
          { touchpoint_number: 6, type: 'Call', reason: 'Fourth follow-up', status: 'Completed' },
          { touchpoint_number: 7, type: 'Visit', reason: 'Final visit', status: 'Completed' }
        ],
        percentage: 5
      },
      {
        name: 'Edge case: TP1, TP4 (skip pattern)',
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Interested' }
        ],
        percentage: 1
      },
      {
        name: 'Edge case: TP1, TP2, TP4 (missing TP3)',
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Site visit', status: 'Interested' }
        ],
        percentage: 1
      }
    ];

    // Calculate client counts per pattern
    let clientIndex = 0;
    const stats: { [key: string]: number } = {};

    for (const pattern of touchpointPatterns) {
      const count = Math.round(clientCount * pattern.percentage / 100);
      stats[pattern.name] = 0;

      console.log(`${'='.repeat(80)}`);
      console.log(`📋 ${pattern.name}`);
      console.log(`   Target: ${count} clients (${pattern.percentage}% of ${clientCount})`);
      console.log(`${'='.repeat(80)}`);

      for (let i = 0; i < count && clientIndex < clientCount; i++, clientIndex++) {
        const client = clients[clientIndex];

        for (const tp of pattern.touchpoints) {
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
              `Test touchpoint for ${pattern.name}`
            ]
          );
        }

        stats[pattern.name]++;
      }

      console.log(`✅ Created ${stats[pattern.name]} clients\n`);
    }

    // Handle any remaining clients with 0 touchpoints
    while (clientIndex < clientCount) {
      const remaining = clientCount - clientIndex;
      console.log(`${'='.repeat(80)}`);
      console.log(`📋 Remaining clients (${remaining}) - 0 touchpoints`);
      console.log(`${'='.repeat(80)}`);
      clientIndex = clientCount;
    }

    console.log(`${'='.repeat(80)}`);
    console.log(`✅ Tele My Calls test data seeded successfully!`);
    console.log(`📊 Total clients processed: ${clientCount}`);
    console.log(`${'='.repeat(80)}\n`);

    // Print statistics
    console.log('\n📊 Distribution Summary:\n');
    console.log('| Pattern | Count | Percentage | Callable |');
    console.log('|---------|-------|------------|----------|');

    for (const pattern of touchpointPatterns) {
      const count = stats[pattern.name] || 0;
      const actualPercentage = ((count / clientCount) * 100).toFixed(1);
      const callable = isCallable(pattern.touchpoints);
      const callableStatus = callable ? 'YES ✅' : 'NO ❌';
      console.log(`| ${pattern.name.padEnd(45)} | ${count.toString().padStart(4)} | ${actualPercentage.padStart(5)}% | ${callableStatus} |`);
    }

    // Expected totals
    const totalCallable = Object.entries(stats).reduce((sum, [name, count]) => {
      const pattern = touchpointPatterns.find(p => p.name === name);
      return sum + (pattern && isCallable(pattern.touchpoints) ? count : 0);
    }, 0);

    console.log('|---------|-------|------------|----------|');
    console.log(`| ${'TOTAL'.padEnd(45)} | ${clientCount.toString().padStart(4)} | 100.0% | |`);
    console.log(`| ${'Expected CALLABLE'.padEnd(45)} | ~${totalCallable.toString().padStart(3)} | ${((totalCallable / clientCount) * 100).toFixed(1)}% | YES ✅ |`);
    console.log(`| ${'Expected NOT CALLABLE'.padEnd(45)} | ~${clientCount - totalCallable} | ${((1 - totalCallable / clientCount) * 100).toFixed(1)}% | NO ❌ |`);

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

function isCallable(touchpoints: TouchpointData[]): boolean {
  const existingNumbers = touchpoints.map(t => t.touchpoint_number);

  if (existingNumbers.includes(1) && !existingNumbers.includes(2)) return true;
  if (existingNumbers.includes(2) && !existingNumbers.includes(3)) return true;
  if (existingNumbers.includes(4) && !existingNumbers.includes(5)) return true;
  if (existingNumbers.includes(5) && !existingNumbers.includes(6)) return true;

  return false;
}

// Run the seed
seedTeleMyCallsData200()
  .then(() => pool.end())
  .catch(console.error);
