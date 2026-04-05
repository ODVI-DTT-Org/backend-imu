/**
 * Test script to verify permission checks
 * Run with: npx tsx src/scripts/test-permissions.ts
 */

import { pool } from '../db/index.js';
import { hasPermission, isRbacInstalled } from '../middleware/permissions.js';

async function testPermissions() {
  console.log('Testing permission system...\n');

  // 1. Check if RBAC is installed
  console.log('1. Checking if RBAC is installed...');
  const rbacInstalled = await isRbacInstalled();
  console.log(`   RBAC installed: ${rbacInstalled}`);

  if (!rbacInstalled) {
    console.log('   ⚠️  RBAC tables not found. Migration 039 may not have been run.');
    console.log('   Run: psql $DATABASE_URL -f src/migrations/039_add_rbac_system.sql');
    process.exit(1);
  }

  // 2. Get a test caravan user
  console.log('\n2. Finding caravan test user...');
  const userResult = await pool.query(
    "SELECT id, email, role FROM users WHERE role = 'caravan' LIMIT 1"
  );

  if (userResult.rows.length === 0) {
    console.log('   ⚠️  No caravan users found in database.');
    process.exit(1);
  }

  const testUser = userResult.rows[0];
  console.log(`   Found user: ${testUser.email} (${testUser.id})`);

  // 3. Check permissions from database
  console.log('\n3. Fetching user permissions from database...');
  const permResult = await pool.query(
    `SELECT resource, action, constraint_name, role_slug
     FROM user_permissions_view
     WHERE user_id = $1
     AND resource IN ('clients', 'itineraries')
     AND action IN ('create', 'update')
     ORDER BY resource, action`,
    [testUser.id]
  );

  console.log(`   Found ${permResult.rows.length} permissions:`);
  for (const perm of permResult.rows) {
    const constraint = perm.constraint_name || '(no constraint)';
    console.log(`   - ${perm.resource}.${perm.action}:${constraint}`);
  }

  // 4. Test permission checks
  console.log('\n4. Testing permission checks...');
  const tests = [
    { resource: 'clients', action: 'create', constraint: undefined },
    { resource: 'clients', action: 'update', constraint: undefined },
    { resource: 'itineraries', action: 'create', constraint: undefined },
    { resource: 'itineraries', action: 'update', constraint: undefined },
    { resource: 'clients', action: 'create', constraint: 'own' },
    { resource: 'clients', action: 'update', constraint: 'own' },
    { resource: 'itineraries', action: 'create', constraint: 'own' },
    { resource: 'itineraries', action: 'update', constraint: 'own' },
  ];

  for (const test of tests) {
    const hasPerm = await hasPermission(testUser.id, test.resource, test.action, test.constraint);
    const constraintStr = test.constraint || '(no constraint)';
    const status = hasPerm ? '✅' : '❌';
    console.log(`   ${status} ${test.resource}.${test.action}:${constraintStr}`);
  }

  // 5. Summary
  console.log('\n5. Summary:');
  console.log('   If tests show ❌ for permissions that should exist:');
  console.log('   a) Check that migration 039 was run successfully');
  console.log('   b) Check that caravan role has permissions in role_permissions table');
  console.log('   c) Check that user has caravan role assigned in user_roles table');

  await pool.end();
  process.exit(0);
}

testPermissions().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
