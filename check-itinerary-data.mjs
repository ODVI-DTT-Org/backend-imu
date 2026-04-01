import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING ITINERARY DATA ===\n');

    // Check if itineraries table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'itineraries'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ itineraries table does not exist');
      return;
    }

    console.log('✅ itineraries table exists\n');

    // Check today's itinerary
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    console.log(`Checking itineraries for: ${todayStr}\n`);

    const todayItineraries = await client.query(`
      SELECT
        id,
        client_id,
        caravan_id,
        scheduled_date,
        scheduled_time,
        status,
        priority,
        notes,
        created_at
      FROM itineraries
      WHERE scheduled_date = $1
      ORDER BY scheduled_time
    `, [todayStr]);

    console.log(`Found ${todayItineraries.rows.length} itineraries for today\n`);

    if (todayItineraries.rows.length > 0) {
      console.log('Today\'s itineraries:');
      todayItineraries.rows.forEach(row => {
        console.log(`  - ID: ${row.id}, Client: ${row.client_id}, Time: ${row.scheduled_time}, Status: ${row.status}`);
      });
    }

    // Check all itineraries
    const allItineraries = await client.query(`
      SELECT
        COUNT(*) as count,
        MIN(scheduled_date) as min_date,
        MAX(scheduled_date) as max_date
      FROM itineraries
    `);

    console.log(`\nAll itineraries: ${allItineraries.rows[0].count} total`);
    console.log(`Date range: ${allItineraries.rows[0].min_date} to ${allItineraries.rows[0].max_date}`);

    // Check itineraries table schema
    const schemaCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'itineraries'
      ORDER BY ordinal_position
    `);

    console.log('\nitineraries table schema:');
    schemaCheck.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

  } finally {
    client.release();
    pool.end();
  }
})();
