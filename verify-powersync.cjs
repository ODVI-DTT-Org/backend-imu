const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/imu_db',
  ssl: false
});

(async () => {
  const client = await pool.connect();
  try {
    // Check PowerSync can query clients
    const result = await client.query(`
      SELECT c.id, c.first_name, c.last_name, c.caravan_id,
             ums.municipality_id
      FROM clients c
      LEFT JOIN user_municipalities_simple ums ON c.caravan_id = ums.user_id
      WHERE c.caravan_id IS NOT NULL
      LIMIT 5
    `);

    console.log('=== DATA FOR POWERSYNC SYNC ===');
    console.log('Clients that will sync to mobile app:');
    result.rows.forEach(row => {
      console.log('  -', row.first_name, row.last_name);
      console.log('    caravan_id:', row.caravan_id);
      console.log('    municipality:', row.municipality_id || 'None');
    });

    // Count by caravan
    const byCaravan = await client.query(`
      SELECT u.email, COUNT(c.id) as client_count
      FROM users u
      JOIN clients c ON c.caravan_id = u.id
      GROUP BY u.email
    `);

    console.log('\n=== CLIENTS BY CARAVAN ===');
    byCaravan.rows.forEach(row => {
      console.log('  -', row.email, ':', row.client_count, 'clients');
    });

    // Check if PowerSync sync rules query will work
    console.log('\n=== POWERSYNC SYNC QUERY TEST ===');
    const powerSyncQuery = await client.query(`
      SELECT c.* FROM clients c WHERE c.caravan_id IS NOT NULL LIMIT 3
    `);
    console.log('PowerSync "all_clients" stream query will return:', powerSyncQuery.rows.length, 'clients');

    const municipalityQuery = await client.query(`
      SELECT id, user_id, municipality_id, assigned_at, assigned_by, deleted_at
      FROM user_municipalities_simple
      WHERE deleted_at IS NULL
      LIMIT 3
    `);
    console.log('PowerSync "user_municipalities" stream query will return:', municipalityQuery.rows.length, 'assignments');

  } finally {
    client.release();
    pool.end();
  }
})();
