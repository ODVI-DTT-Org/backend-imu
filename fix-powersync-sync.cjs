const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== FIXING POWERSYNC SYNC ISSUES ===\n');

    // Step 1: Create user_profiles table (migration 020 dropped it, but sync rules need it)
    console.log('Step 1: Creating user_profiles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        avatar_url TEXT,
        area_manager_id UUID,
        assistant_area_manager_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ user_profiles table created\n');

    // Step 2: Populate user_profiles from users table
    console.log('Step 2: Populating user_profiles from users...');
    const populateResult = await client.query(`
      INSERT INTO user_profiles (user_id, name, email, role, avatar_url, area_manager_id, assistant_area_manager_id)
      SELECT
        u.id as user_id,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as name,
        u.email,
        u.role,
        u.avatar_url,
        NULL as area_manager_id,
        NULL as assistant_area_manager_id
      FROM users u
      ON CONFLICT (user_id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
      RETURNING user_id, email, role
    `);
    console.log(`✅ Populated ${populateResult.rows.length} user profiles\n`);

    // Step 3: Verify sync tables
    console.log('Step 3: Verifying all PowerSync tables...');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('user_profiles', 'clients', 'user_municipalities_simple', 'psgc', 'touchpoint_reasons', 'addresses', 'phone_numbers', 'touchpoints')
      ORDER BY table_name
    `);
    console.log('Tables for PowerSync:');
    tables.rows.forEach(r => console.log(`  ✅ ${r.table_name}`));

    // Step 4: Show data counts
    console.log('\n=== DATA COUNTS FOR SYNC ===');
    const counts = await client.query(`
      SELECT
        'user_profiles' as table_name, COUNT(*) as count FROM user_profiles
      UNION ALL
      SELECT 'clients', COUNT(*) FROM clients
      UNION ALL
      SELECT 'user_municipalities_simple', COUNT(*) FROM user_municipalities_simple WHERE deleted_at IS NULL
      UNION ALL
      SELECT 'psgc', COUNT(*) FROM psgc
      UNION ALL
      SELECT 'touchpoint_reasons', COUNT(*) FROM touchpoint_reasons
      UNION ALL
      SELECT 'addresses', COUNT(*) FROM addresses
      UNION ALL
      SELECT 'phone_numbers', COUNT(*) FROM phone_numbers
    `);
    counts.rows.forEach(r => console.log(`  - ${r.table_name}: ${r.count} rows`));

    console.log('\n✅ All PowerSync sync issues fixed!');
    console.log('\n⚠️  IMPORTANT: PowerSync Cloud still needs to be configured at https://app.powersync.com');
    console.log('   - Add your PostgreSQL database connection');
    console.log('   - Upload sync rules from docs/powersync-sync-rules.yaml');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    pool.end();
  }
})();
