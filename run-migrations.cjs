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
