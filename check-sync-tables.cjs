const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING TABLES FOR POWERSYNC ===');

    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('user_profiles', 'clients', 'user_municipalities_simple', 'psgc', 'touchpoint_reasons')
      ORDER BY table_name
    `);

    console.log('Required tables:');
    tables.rows.forEach(r => {
      const exists = '✅';
      console.log(`  ${exists} ${r.table_name}`);
    });

    // Check if user_profiles exists
    const userProfilesExists = tables.rows.find(r => r.table_name === 'user_profiles');
    if (!userProfilesExists) {
      console.log('\n⚠️  user_profiles table does not exist!');
      console.log('   Sync rules reference this table but it might not be created yet.');
    }

    // Check what tables actually have data
    console.log('\n=== TABLE DATA COUNTS ===');
    const counts = await client.query(`
      SELECT
        'clients' as table_name, COUNT(*) as count FROM clients
      UNION ALL
      SELECT
        'user_municipalities_simple' as table_name, COUNT(*) as count FROM user_municipalities_simple WHERE deleted_at IS NULL
      UNION ALL
      SELECT
        'psgc' as table_name, COUNT(*) as count FROM psgc
      UNION ALL
      SELECT
        'touchpoint_reasons' as table_name, COUNT(*) as count FROM touchpoint_reasons
    `);

    counts.rows.forEach(r => {
      console.log(`  - ${r.table_name}: ${r.count} rows`);
    });

  } finally {
    client.release();
    pool.end();
  }
})();
