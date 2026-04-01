import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING ITINERARY DETAILS ===\n');

    // Get today's itineraries with full details
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const result = await client.query(`
      SELECT
        i.id,
        i.caravan_id,
        i.client_id,
        i.scheduled_date,
        i.scheduled_time,
        i.status,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.municipality as client_municipality
      FROM itineraries i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.scheduled_date = $1
      ORDER BY i.scheduled_time
    `, [todayStr]);

    console.log(`Found ${result.rows.length} itineraries for ${todayStr}\n`);

    if (result.rows.length > 0) {
      console.log('Itinerary details:');
      result.rows.forEach((row, index) => {
        console.log(`\n${index + 1}. ID: ${row.id}`);
        console.log(`   Client: ${row.client_first_name} ${row.client_last_name}`);
        console.log(`   Client ID: ${row.client_id}`);
        console.log(`   Client Municipality: ${row.client_municipality}`);
        console.log(`   Caravan ID: ${row.caravan_id}`);
        console.log(`   Scheduled: ${row.scheduled_date} at ${row.scheduled_time || 'any time'}`);
        console.log(`   Status: ${row.status}`);
      });
    }

    // Check what users exist
    console.log('\n=== CHECKING USERS ===');
    const users = await client.query(`
      SELECT id, email, first_name, last_name, role
      FROM users
      WHERE role IN ('field_agent', 'caravan')
      LIMIT 10
    `);

    console.log(`\nFound ${users.rows.length} field_agent/caravan users:`);
    users.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.email} (${row.role}) - ID: ${row.id}`);
    });

  } finally {
    client.release();
    pool.end();
  }
})();
