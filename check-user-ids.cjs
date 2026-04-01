const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING USER IDs FOR POWERSYNC SYNC ===\n');

    // Check user_profiles table
    const userProfiles = await client.query(`
      SELECT id, user_id, name, email, role
      FROM user_profiles
      ORDER BY created_at DESC
      LIMIT 20
    `);

    console.log('user_profiles table:');
    if (userProfiles.rows.length === 0) {
      console.log('  ❌ NO DATA FOUND');
    } else {
      userProfiles.rows.forEach(row => {
        console.log(`  - id: ${row.id}, user_id: ${row.user_id}, name: ${row.name}, email: ${row.email}`);
      });
    }

    // Check users table for comparison
    const users = await client.query(`
      SELECT id, email, first_name, last_name, role
      FROM users
      ORDER BY created_at DESC
      LIMIT 20
    `);

    console.log('\nusers table (for reference):');
    if (users.rows.length === 0) {
      console.log('  ❌ NO DATA FOUND');
    } else {
      users.rows.forEach(row => {
        console.log(`  - id: ${row.id}, email: ${row.email}, name: ${row.first_name} ${row.last_name}, role: ${row.role}`);
      });
    }

    // Check clients table
    const clientsCount = await client.query(`SELECT COUNT(*) as count FROM clients`);
    console.log(`\nclients table: ${clientsCount.rows[0].count} rows`);

    // Check client caravan_id assignments
    const clientCaravans = await client.query(`
      SELECT caravan_id, COUNT(*) as count
      FROM clients
      WHERE caravan_id IS NOT NULL
      GROUP BY caravan_id
      ORDER BY count DESC
      LIMIT 10
    `);

    console.log('\nclients by caravan_id:');
    if (clientCaravans.rows.length === 0) {
      console.log('  ❌ NO CLIENTS ASSIGNED TO CARAVANS');
    } else {
      clientCaravans.rows.forEach(row => {
        console.log(`  - caravan_id: ${row.caravan_id}, count: ${row.count}`);
      });
    }

  } finally {
    client.release();
    pool.end();
  }
})();
