/**
 * Cleanup Script for Test Data
 * Removes all test data created during testing
 */

const { Client } = require('pg');

async function cleanupTestData() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@host:port/database',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to QA2 database');
    console.log('\n🧹 Cleaning up test data...\n');

    let deletedCount = 0;

    // 1. Delete test users
    console.log('1. Deleting test users...');
    const testEmails = [
      'admin@test.com',
      'areamgr@test.com',
      'asstareamgr@test.com',
      'caravan@test.com',
      'tele@test.com'
    ];

    for (const email of testEmails) {
      try {
        // First, remove role assignments
        await client.query('DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [email]);
        // Then delete the user
        const result = await client.query('DELETE FROM users WHERE email = $1 RETURNING id', [email]);
        if (result.rows.length > 0) {
          console.log(`   ✅ Deleted user: ${email}`);
          deletedCount++;
        }
      } catch (err) {
        console.log(`   ⚠️  Could not delete user ${email}: ${err.message}`);
      }
    }

    // 2. Delete test clients
    console.log('\n2. Deleting test clients...');

    // Maria Santos Cruz (with multiple addresses)
    try {
      const result = await client.query("DELETE FROM clients WHERE first_name = 'MARIA' AND last_name = 'CRUZ' RETURNING id");
      if (result.rows.length > 0) {
        console.log(`   ✅ Deleted client: MARIA CRUZ (with ${result.rows.length} addresses)`);
        deletedCount += result.rows.length;
      }
    } catch (err) {
      console.log(`   ⚠️  Could not delete MARIA CRUZ: ${err.message}`);
    }

    // Fuzzy search test clients (Rodolfo/Rodelfo Marin/Marinez)
    try {
      const result = await client.query(`
        DELETE FROM clients
        WHERE first_name IN ('RODOLFO', 'RODELFO')
          AND last_name IN ('MARIN', 'MARINEZ')
          AND middle_name IN ('M', 'S', NULL)
          AND created_at > NOW() - INTERVAL '1 day'
        RETURNING id
      `);
      if (result.rows.length > 0) {
        console.log(`   ✅ Deleted ${result.rows.length} fuzzy search test clients`);
        deletedCount += result.rows.length;
      }
    } catch (err) {
      console.log(`   ⚠️  Could not delete fuzzy search clients: ${err.message}`);
    }

    // Juan Delacruz (for visits/calls testing)
    try {
      const result = await client.query("DELETE FROM clients WHERE first_name = 'JUAN' AND last_name = 'DELACRUZ' AND middle_name = 'A' RETURNING id");
      if (result.rows.length > 0) {
        console.log(`   ✅ Deleted client: JUAN DELACRUZ (visits/calls testing)`);
        deletedCount += result.rows.length;
      }
    } catch (err) {
      console.log(`   ⚠️  Could not delete JUAN DELACRUZ: ${err.message}`);
    }

    // 3. Delete orphaned addresses and phone numbers (cascade should handle this, but just in case)
    console.log('\n3. Cleaning up orphaned addresses and phone numbers...');
    try {
      const addrResult = await client.query(`
        DELETE FROM addresses
        WHERE client_id NOT IN (SELECT id FROM clients)
        RETURNING id
      `);
      if (addrResult.rows.length > 0) {
        console.log(`   ✅ Deleted ${addrResult.rows.length} orphaned addresses`);
        deletedCount += addrResult.rows.length;
      }
    } catch (err) {
      console.log(`   ⚠️  Could not delete orphaned addresses: ${err.message}`);
    }

    try {
      const phoneResult = await client.query(`
        DELETE FROM phone_numbers
        WHERE client_id NOT IN (SELECT id FROM clients)
        RETURNING id
      `);
      if (phoneResult.rows.length > 0) {
        console.log(`   ✅ Deleted ${phoneResult.rows.length} orphaned phone numbers`);
        deletedCount += phoneResult.rows.length;
      }
    } catch (err) {
      console.log(`   ⚠️  Could not delete orphaned phone numbers: ${err.message}`);
    }

    // 4. Verify cleanup
    console.log('\n4. Verifying cleanup...');
    const remainingTestUsers = await client.query(`
      SELECT COUNT(*) as count
      FROM users
      WHERE email LIKE '%@test.com'
    `);
    console.log(`   Remaining test users: ${remainingTestUsers.rows[0].count}`);

    const remainingTestClients = await client.query(`
      SELECT COUNT(*) as count
      FROM clients
      WHERE first_name IN ('MARIA', 'JUAN')
        AND last_name IN ('CRUZ', 'DELACRUZ')
        AND created_at > NOW() - INTERVAL '1 day'
    `);
    console.log(`   Remaining test clients: ${remainingTestClients.rows[0].count}`);

    console.log('\n✅ Test data cleanup complete!');
    console.log(`Total records deleted: ${deletedCount}`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

cleanupTestData().catch(console.error);
