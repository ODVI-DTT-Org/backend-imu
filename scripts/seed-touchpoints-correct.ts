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
 * Seed clients with CORRECT touchpoint sequence
 *
 * CORRECT Sequence:
 * TP1: Visit (Caravan)
 * TP2: Call (Tele)
 * TP3: Call (Tele)
 * TP4: Visit (Caravan)
 * TP5: Call (Tele)
 * TP6: Call (Tele)
 * TP7: Visit (Caravan) → Completed
 */

// First names and last names for generating client data
const firstNames = [
  'Juan', 'Maria', 'Carlos', 'Ana', 'Miguel', 'Carmen', 'Jose', 'Luz',
  'Pedro', 'Rosa', 'Antonio', 'Teresa', 'Francisco', 'Isabel', 'Diego', 'Laura'
];

const lastNames = [
  'Garcia', 'Rodriguez', 'Martinez', 'Lopez', 'Gonzalez', 'Perez', 'Sanchez', 'Ramirez',
  'Cruz', 'Flores', 'Torres', 'Rivera', 'Morales', 'Reyes', 'Jimenez', 'Castillo'
];

// Touchpoint reasons by type
const visitReasons = [
  'Initial site visit',
  'Follow-up visit',
  'Document collection',
  'Verification visit',
  'Final assessment'
];

const callReasons = [
  'Initial contact',
  'Follow-up call',
  'Information verification',
  'Appointment scheduling',
  'Status update'
];

function getRandomElement(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomPhone(): string {
  return `09${Math.floor(Math.random() * 100000000).toString().padStart(9, '0')}`;
}

function getRandomEmail(firstName: string, lastName: string): string {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com'];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 100)}@${getRandomElement(domains)}`;
}

// Clean existing data
async function cleanExistingData() {
  console.log('🧹 Cleaning existing touchpoints, itineraries, and clients...');
  await pool.query('DELETE FROM touchpoints');
  await pool.query('DELETE FROM itineraries');
  await pool.query('DELETE FROM clients');
  console.log('✅ Cleaned existing data\n');
}

// Seed clients with correct touchpoint sequence
async function seedTouchpoints() {
  try {
    // Clean first
    await cleanExistingData();

    console.log('🌱 Seeding clients with CORRECT touchpoint sequence...\n');

    // Define scenarios with correct touchpoint types
    const scenarios = [
      {
        name: '0 touchpoints (new clients)',
        count: 40,
        touchpoints: []
      },
      {
        name: 'TP1 only (Visit by Caravan)',
        count: 30,
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial site visit', status: 'Interested' }
        ]
      },
      {
        name: 'TP1, TP2 (Visit → Call)',
        count: 25,
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial site visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Initial contact', status: 'Interested' }
        ]
      },
      {
        name: 'TP1, TP2, TP3 (Visit → Call → Call)',
        count: 20,
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial site visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Initial contact', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Follow-up call', status: 'Interested' }
        ]
      },
      {
        name: 'TP1, TP2, TP3, TP4 (Visit → Call → Call → Visit)',
        count: 20,
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial site visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Initial contact', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Follow-up visit', status: 'Interested' }
        ]
      },
      {
        name: 'TP1, TP2, TP3, TP4, TP5 (Visit → Call → Call → Visit → Call)',
        count: 20,
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial site visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Initial contact', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Follow-up visit', status: 'Interested' },
          { touchpoint_number: 5, type: 'Call', reason: 'Status update', status: 'Interested' }
        ]
      },
      {
        name: 'TP1, TP2, TP3, TP4, TP5, TP6 (Visit → Call → Call → Visit → Call → Call)',
        count: 20,
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial site visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Initial contact', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Follow-up visit', status: 'Interested' },
          { touchpoint_number: 5, type: 'Call', reason: 'Status update', status: 'Interested' },
          { touchpoint_number: 6, type: 'Call', reason: 'Appointment scheduling', status: 'Interested' }
        ]
      },
      {
        name: 'TP1-TP7 Complete (Visit → Call → Call → Visit → Call → Call → Visit)',
        count: 15,
        touchpoints: [
          { touchpoint_number: 1, type: 'Visit', reason: 'Initial site visit', status: 'Interested' },
          { touchpoint_number: 2, type: 'Call', reason: 'Initial contact', status: 'Interested' },
          { touchpoint_number: 3, type: 'Call', reason: 'Follow-up call', status: 'Interested' },
          { touchpoint_number: 4, type: 'Visit', reason: 'Follow-up visit', status: 'Interested' },
          { touchpoint_number: 5, type: 'Call', reason: 'Status update', status: 'Interested' },
          { touchpoint_number: 6, type: 'Call', reason: 'Appointment scheduling', status: 'Interested' },
          { touchpoint_number: 7, type: 'Visit', reason: 'Final assessment', status: 'Completed' }
        ]
      }
    ];

    let totalClients = 0;
    let totalTouchpoints = 0;

    // Get a user ID for touchpoints (assuming there's at least one user)
    const userResult = await pool.query('SELECT id FROM users LIMIT 1');
    const userId = userResult.rows[0]?.id;

    for (const scenario of scenarios) {
      console.log(`📊 Creating ${scenario.count} clients with ${scenario.name}...`);

      for (let i = 0; i < scenario.count; i++) {
        const firstName = getRandomElement(firstNames);
        const lastName = getRandomElement(lastNames);
        const email = getRandomEmail(firstName, lastName);

        // Create client
        const clientResult = await pool.query(
          `INSERT INTO clients (first_name, last_name, email, phone, client_type, product_type, market_type, pension_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            firstName,
            lastName,
            email,
            getRandomPhone(),
            Math.random() > 0.5 ? 'POTENTIAL' : 'EXISTING',
            'Salary Loan',
            'Regular',
            'SSS'
          ]
        );

        const clientId = clientResult.rows[0].id;
        totalClients++;

        // Create touchpoints for this client
        for (const tp of scenario.touchpoints) {
          await pool.query(
            `INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, date, reason, status)
             VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6)`,
            [clientId, userId, tp.touchpoint_number, tp.type, tp.reason, tp.status]
          );
          totalTouchpoints++;
        }
      }

      console.log(`   ✅ Created ${scenario.count} clients\n`);
    }

    console.log('='.repeat(60));
    console.log('📈 SEEDING SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total clients created: ${totalClients}`);
    console.log(`Total touchpoints created: ${totalTouchpoints}`);
    console.log('');
    console.log('✅ Touchpoint sequence validation:');
    console.log('   TP1: Visit (Caravan)');
    console.log('   TP2: Call (Tele)');
    console.log('   TP3: Call (Tele)');
    console.log('   TP4: Visit (Caravan)');
    console.log('   TP5: Call (Tele)');
    console.log('   TP6: Call (Tele)');
    console.log('   TP7: Visit (Caravan) → Completed');
    console.log('');

    // Verify the seeded data
    console.log('🔍 Verifying seeded data...');
    const verification = await pool.query(`
      SELECT
        t.touchpoint_number,
        t.type,
        COUNT(*) as count
      FROM touchpoints t
      GROUP BY t.touchpoint_number, t.type
      ORDER BY t.touchpoint_number
    `);

    console.log('');
    console.log('Touchpoint distribution:');
    console.log('| TP# | Type | Count | Correct? |');
    console.log('|-----|------|-------|----------|');

    const correctTypes: Record<number, string> = {
      1: 'Visit',
      2: 'Call',
      3: 'Call',
      4: 'Visit',
      5: 'Call',
      6: 'Call',
      7: 'Visit'
    };

    let allCorrect = true;
    for (const row of verification.rows) {
      const expectedType = correctTypes[row.touchpoint_number];
      const isCorrect = row.type === expectedType;
      const status = isCorrect ? '✅' : '❌';
      if (!isCorrect) allCorrect = false;

      console.log(`| ${row.touchpoint_number}   | ${row.type} | ${row.count} | ${status} |`);
    }

    console.log('');
    if (allCorrect) {
      console.log('✅ ALL TOUCHPOINTS HAVE CORRECT TYPES!');
    } else {
      console.log('❌ SOME TOUCHPOINTS HAVE INCORRECT TYPES!');
    }

    await pool.end();
  } catch (error) {
    console.error('Error seeding touchpoints:', error);
    await pool.end();
    process.exit(1);
  }
}

seedTouchpoints().catch(console.error);
