const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== INVESTIGATING POWERSYNC SYNC ISSUE ===\n');

    // Check if user_profiles exists
    const userProfilesCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_profiles'
      )
    `);
    console.log('user_profiles table exists:', userProfilesCheck.rows[0].exists);

    // Check all tables that should sync
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('clients', 'user_profiles', 'addresses', 'phone_numbers', 'touchpoints')
      ORDER BY table_name
    `);
    console.log('\nTables that should sync:');
    tables.rows.forEach(r => console.log('  -', r.table_name));

    // Check row counts in production database
    console.log('\n=== ROW COUNTS IN PRODUCTION DATABASE ===');
    const counts = await client.query(`
      SELECT
        'clients' as table_name, COUNT(*) as count FROM clients
      UNION ALL
      SELECT 'user_profiles', COUNT(*) FROM user_profiles
      UNION ALL
      SELECT 'addresses', COUNT(*) FROM addresses
      UNION ALL
      SELECT 'phone_numbers', COUNT(*) FROM phone_numbers
      UNION ALL
      SELECT 'touchpoints', COUNT(*) FROM touchpoints
    `);
    counts.rows.forEach(r => console.log(`  - ${r.table_name}: ${r.count} rows`));

    // Test the all_clients sync query
    console.log('\n=== TESTING ALL_CLIENTS SYNC QUERY ===');
    const allClientsQuery = await client.query(`
      SELECT c.* FROM clients c LIMIT 3
    `);
    console.log('all_clients stream query returns:', allClientsQuery.rows.length, 'clients');

    // Test user_profile sync query
    console.log('\n=== TESTING USER_PROFILE SYNC QUERY ===');
    const userProfileQuery = await client.query(`
      SELECT up.id, up.user_id, up.name, up.email, up.role, up.avatar_url, up.updated_at
      FROM user_profiles up
      LIMIT 3
    `);
    console.log('user_profile stream query returns:', userProfileQuery.rows.length, 'profiles');

    // Check if there are any issues with the sync rules
    console.log('\n=== POTENTIAL ISSUES ===');
    console.log('1. PowerSync Cloud may not be configured to sync these tables');
    console.log('2. Sync rules need to be uploaded to PowerSync dashboard');
    console.log('3. Database permissions may prevent PowerSync from accessing tables');

  } finally {
    client.release();
    pool.end();
  }
})();
