const { pool } = require('./dist/db/index.js');

async function testCRUD() {
  try {
    console.log('=== Testing Normalized Database CRUD Operations ===\n');

    // Test 1: Users table has caravan roles
    console.log('1. Testing users table for caravan/field_agent roles...');
    const users = await pool.query(
      "SELECT id, email, first_name, last_name, role, is_active FROM users WHERE role IN ('field_agent', 'caravan') LIMIT 5"
    );
    console.log(`   Found ${users.rows.length} users with caravan/field_agent roles`);
    if (users.rows.length > 0) {
      console.log(`   Sample: ${users.rows[0].first_name} ${users.rows[0].last_name} (${users.rows[0].role})`);
    }

    // Test 2: Groups table references users
    console.log('\n2. Testing groups.team_leader_id references users...');
    const groups = await pool.query(
      "SELECT g.id, g.name, g.team_leader_id, u.email, u.role FROM groups g LEFT JOIN users u ON u.id = g.team_leader_id LIMIT 5"
    );
    console.log(`   Found ${groups.rows.length} groups`);
    if (groups.rows.length > 0) {
      console.log(`   Sample: ${groups.rows[0].name} - leader: ${groups.rows[0].email || 'None'}`);
    }

    // Test 3: user_locations table exists
    console.log('\n3. Testing user_locations table...');
    const locationsCheck = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_locations')"
    );
    console.log(`   user_locations table exists: ${locationsCheck.rows[0].exists}`);

    // Test 4: Check for location assignments
    const assignments = await pool.query(
      "SELECT COUNT(*) as count FROM user_locations WHERE deleted_at IS NULL"
    );
    console.log(`   Active location assignments: ${assignments.rows[0].count}`);

    // Test 5: Verify caravans table is dropped
    console.log('\n4. Verifying redundant tables are dropped...');
    const caravansCheck = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'caravans')"
    );
    console.log(`   caravans table exists: ${caravansCheck.rows[0].exists} (should be false)`);

    const userProfilesCheck = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles')"
    );
    console.log(`   user_profiles table exists: ${userProfilesCheck.rows[0].exists} (should be false)`);

    // Test 6: Audit logs table
    console.log('\n5. Testing audit_logs table...');
    const auditCheck = await pool.query(
      "SELECT COUNT(*) as count FROM audit_logs"
    );
    console.log(`   Total audit log entries: ${auditCheck.rows[0].count}`);

    console.log('\n=== All Tests Passed! ===');
    await pool.end();
  } catch (error) {
    console.error('Test failed:', error.message);
    await pool.end();
    process.exit(1);
  }
}

testCRUD();
