const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://user:password@host:port/database';

  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false,
      checkServerIdentity: () => {}
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to QA2 database');

    // Run migration 051
    console.log('\n📋 Running migration 051: RBAC for visits, calls, releases...');
    const migration051 = fs.readFileSync(path.join(__dirname, 'src/migrations/051_add_rbac_for_new_tables.sql'), 'utf8');
    await client.query(migration051);
    console.log('✅ Migration 051 completed');

    // Run migration 060
    console.log('\n📋 Running migration 060: RBAC for addresses, phone_numbers...');
    const migration060 = fs.readFileSync(path.join(__dirname, 'src/migrations/060_add_rbac_for_addresses_phones.sql'), 'utf8');
    await client.query(migration060);
    console.log('✅ Migration 060 completed');

    // Run migration 1100
    console.log('\n📋 Running migration 1100: Create agents table...');
    const migration1100 = fs.readFileSync(path.join(__dirname, 'migrations/1100_create_agents.sql'), 'utf8');
    await client.query(migration1100);
    console.log('✅ Migration 1100 completed');

    // Run migration 1101
    console.log('\n📋 Running migration 1101: Release agent columns...');
    const migration1101 = fs.readFileSync(path.join(__dirname, 'migrations/1101_release_agent_columns.sql'), 'utf8');
    await client.query(migration1101);
    console.log('✅ Migration 1101 completed');

    // Run migration 1102
    console.log('\n📋 Running migration 1102: Client type market type enums...');
    const migration1102 = fs.readFileSync(path.join(__dirname, 'migrations/1102_client_type_market_type_enums.sql'), 'utf8');
    await client.query(migration1102);
    console.log('✅ Migration 1102 completed');

    // Run migration 1103
    console.log('\n📋 Running migration 1103: Client status history table...');
    const migration1103 = fs.readFileSync(path.join(__dirname, 'migrations/1103_client_status_history.sql'), 'utf8');
    await client.query(migration1103);
    console.log('✅ Migration 1103 completed');

    // Run migration 1104
    console.log('\n📋 Running migration 1104: Status transition trigger...');
    const migration1104 = fs.readFileSync(path.join(__dirname, 'migrations/1104_status_transition_trigger.sql'), 'utf8');
    await client.query(migration1104);
    console.log('✅ Migration 1104 completed');

    // Run migration 1105
    console.log('\n📋 Running migration 1105: PowerSync publication add...');
    const migration1105 = fs.readFileSync(path.join(__dirname, 'migrations/1105_powersync_publication_add.sql'), 'utf8');
    await client.query(migration1105);
    console.log('✅ Migration 1105 completed');

    // Run migration 1107
    console.log('\n📋 Running migration 1107: Touchpoints type loan release...');
    const migration1107 = fs.readFileSync(path.join(__dirname, 'migrations/1107_touchpoints_type_loan_release.sql'), 'utf8');
    await client.query(migration1107);
    console.log('✅ Migration 1107 completed');

    // Run migration 1108
    console.log('\n📋 Running migration 1108: Backfill lifecycle from history...');
    const migration1108 = fs.readFileSync(path.join(__dirname, 'migrations/1108_backfill_lifecycle_from_history.sql'), 'utf8');
    await client.query(migration1108);
    console.log('✅ Migration 1108 completed');

    // Verify permissions
    console.log('\n🔍 Verifying permissions...');
    const result = await client.query(`
      SELECT resource, action, constraint_name, COUNT(*) as count
      FROM permissions
      WHERE resource IN ('visits', 'calls', 'releases', 'addresses', 'phone_numbers')
      GROUP BY resource, action, constraint_name
      ORDER BY resource, action
    `);

    console.log('\n✅ Permissions created:');
    if (result.rows.length > 0) {
      console.log('Resource      | Action  | Constraint | Count');
      console.log('--------------|---------|------------|-------');
      result.rows.forEach(row => {
        const resource = (row.resource || 'NULL').padEnd(12);
        const action = (row.action || 'NULL').padEnd(7);
        const constraint = (row.constraint_name || 'NULL').padEnd(10);
        console.log(`${resource} | ${action} | ${constraint} | ${row.count}`);
      });
    } else {
      console.log('No new permissions found (may already exist)');
    }

    // Verify role permissions
    const rolePerms = await client.query(`
      SELECT r.slug as role, p.resource, COUNT(*) as perm_count
      FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.resource IN ('visits', 'calls', 'releases', 'addresses', 'phone_numbers')
      GROUP BY r.slug, p.resource
      ORDER BY r.slug, p.resource
    `);

    console.log('\n✅ Role permissions assigned:');
    if (rolePerms.rows.length > 0) {
      console.log('Role      | Resource    | Permissions');
      console.log('----------|-------------|------------');
      rolePerms.rows.forEach(row => {
        console.log(`${row.role.padEnd(9)} | ${row.resource.padEnd(11)} | ${row.perm_count}`);
      });
    } else {
      console.log('No role permissions found');
    }

    console.log('\n🎉 All migrations completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

runMigrations().catch(console.error);
