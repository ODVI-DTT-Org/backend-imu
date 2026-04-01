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

async function seedAllTouchpoints() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    // Get a tele user and caravan user
    const usersResult = await client.query(
      `SELECT id, email, role FROM users WHERE role IN ('tele', 'caravan') LIMIT 2`
    );

    if (usersResult.rows.length < 2) {
      console.log('Need at least one tele user and one caravan user');
      return;
    }

    const teleUser = usersResult.rows.find(u => u.role === 'tele');
    const caravanUser = usersResult.rows.find(u => u.role === 'caravan');

    console.log('Tele user:', teleUser?.email, teleUser?.id);
    console.log('Caravan user:', caravanUser?.email, caravanUser?.id);

    // Get clients
    const clientsResult = await client.query(
      `SELECT id, first_name, last_name FROM clients ORDER BY created_at DESC LIMIT 5`
    );

    console.log(`Found ${clientsResult.rows.length} clients`);

    // Touchpoint sequence: Visit, Call, Call, Visit, Call, Call, Visit
    const touchpointSequence = [
      { number: 1, type: 'Visit', userId: caravanUser?.id },
      { number: 2, type: 'Call', userId: teleUser?.id },
      { number: 3, type: 'Call', userId: teleUser?.id },
      { number: 4, type: 'Visit', userId: caravanUser?.id },
      { number: 5, type: 'Call', userId: teleUser?.id },
      { number: 6, type: 'Call', userId: teleUser?.id },
      { number: 7, type: 'Visit', userId: caravanUser?.id },
    ];

    for (const clientRow of clientsResult.rows) {
      console.log(`\nProcessing client: ${clientRow.first_name} ${clientRow.last_name}`);

      // Check existing touchpoints
      const existingResult = await client.query(
        `SELECT touchpoint_number FROM touchpoints WHERE client_id = $1`,
        [clientRow.id]
      );
      const existingNumbers = existingResult.rows.map(r => r.touchpoint_number);
      console.log(`Existing touchpoints: ${existingNumbers.join(', ') || 'none'}`);

      // Create all 7 touchpoints
      for (const tp of touchpointSequence) {
        if (existingNumbers.includes(tp.number)) {
          console.log(`  TP${tp.number} already exists, skipping`);
          continue;
        }

        const date = new Date();
        date.setDate(date.getDate() - (7 - tp.number)); // Stagger dates

        await client.query(
          `INSERT INTO touchpoints (
            client_id, user_id, touchpoint_number, type, date, reason, status, notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
          [
            clientRow.id,
            tp.userId,
            tp.number,
            tp.type,
            date.toISOString().split('T')[0],
            `Touchpoint ${tp.number} - ${tp.type}`,
            'Completed',
            `Seeded data for TP${tp.number}`,
          ]
        );

        console.log(`  ✅ Created TP${tp.number} (${tp.type})`);
      }
    }

    // Verify the data
    console.log('\n\n=== Verification ===');
    for (const clientRow of clientsResult.rows) {
      const verifyResult = await client.query(
        `SELECT touchpoint_number, type FROM touchpoints WHERE client_id = $1 ORDER BY touchpoint_number`,
        [clientRow.id]
      );
      console.log(`\n${clientRow.first_name} ${clientRow.last_name}:`);
      verifyResult.rows.forEach(row => {
        console.log(`  TP${row.touchpoint_number}: ${row.type}`);
      });
    }

    console.log('\n✅ Seed complete!');
    await client.query('COMMIT');
  } catch (error) {
    console.error('Error:', error);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

seedAllTouchpoints();
