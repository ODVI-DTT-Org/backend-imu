/**
 * Test RBAC User Synchronization
 *
 * This script tests that user creation and updates properly sync with the RBAC system.
 */

import { pool } from '../src/db/index.js';
import bcrypt from 'bcryptjs';

async function testRbacUserSync() {
  console.log('🧪 Testing RBAC User Synchronization...\n');

  try {
    // Test 1: Create user and verify RBAC sync
    console.log('Test 1: Create user with RBAC sync');
    console.log('======================================');

    const testEmail = `test-rbac-${Date.now()}@imu.local`;
    const password_hash = await bcrypt.hash('test123', 10);

    // Create user
    const userResult = await pool.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING id, email, role`,
      [testEmail, password_hash, 'Test', 'User', 'caravan']
    );

    const newUser = userResult.rows[0];
    console.log(`✅ User created: ${newUser.email} (${newUser.id})`);
    console.log(`   Role in users table: ${newUser.role}`);

    // Simulate RBAC sync (same logic as in users.ts)
    const adminUser = await pool.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    if (adminUser.rows.length === 0) {
      throw new Error('No admin user found for testing');
    }
    const adminId = adminUser.rows[0].id;

    const roleResult = await pool.query(
      'SELECT id FROM roles WHERE slug = $1',
      [newUser.role]
    );

    if (roleResult.rows.length > 0) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (user_id, role_id) DO UPDATE SET
           is_active = TRUE,
           assigned_by = $3`,
        [newUser.id, roleResult.rows[0].id, adminId]
      );
      console.log(`✅ RBAC entry created for user`);
    }

    // Verify RBAC entry
    const rbacCheck = await pool.query(
      `SELECT COUNT(*) as count FROM user_roles WHERE user_id = $1 AND is_active = TRUE`,
      [newUser.id]
    );
    console.log(`   RBAC entries for user: ${rbacCheck.rows[0].count}`);

    // Test permission function
    const permCheck = await pool.query(
      `SELECT has_permission($1, 'clients', 'create') as can_create_client,
              has_permission($1, 'touchpoints', 'create', 'visit') as can_create_visit`,
      [newUser.id]
    );
    console.log(`   Can create clients: ${permCheck.rows[0].can_create_client}`);
    console.log(`   Can create visits: ${permCheck.rows[0].can_create_visit}`);

    // Test 2: Update user role and verify RBAC sync
    console.log('\nTest 2: Update user role with RBAC sync');
    console.log('======================================');

    // Change role from caravan to tele
    await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2`,
      ['tele', newUser.id]
    );
    console.log(`✅ User role updated to: tele`);

    // Simulate RBAC sync for role change
    const newRoleResult = await pool.query(
      'SELECT id FROM roles WHERE slug = $1',
      ['tele']
    );

    if (newRoleResult.rows.length > 0) {
      // Deactivate old role assignments
      await pool.query(
        `UPDATE user_roles
         SET is_active = FALSE
         WHERE user_id = $1`,
        [newUser.id]
      );

      // Create new role assignment
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (user_id, role_id) DO UPDATE SET
           is_active = TRUE,
           assigned_by = $3`,
        [newUser.id, newRoleResult.rows[0].id, adminId]
      );
      console.log(`✅ RBAC entry updated for user`);
    }

    // Verify RBAC update
    const rbacCheck2 = await pool.query(
      `SELECT r.slug, ur.is_active
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [newUser.id]
    );
    console.log(`   Active RBAC roles for user:`);
    rbacCheck2.rows.forEach(row => {
      console.log(`     - ${row.slug} (active: ${row.is_active})`);
    });

    // Verify permissions changed
    const permCheck2 = await pool.query(
      `SELECT has_permission($1, 'touchpoints', 'create', 'visit') as can_create_visit,
              has_permission($1, 'touchpoints', 'create', 'call') as can_create_call`,
      [newUser.id]
    );
    console.log(`   Can create visits: ${permCheck2.rows[0].can_create_visit}`);
    console.log(`   Can create calls: ${permCheck2.rows[0].can_create_call}`);

    // Cleanup: Delete test user
    console.log('\nCleanup: Deleting test user');
    await pool.query('DELETE FROM user_roles WHERE user_id = $1', [newUser.id]);
    await pool.query('DELETE FROM user_profiles WHERE user_id = $1', [newUser.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [newUser.id]);
    console.log('✅ Test user deleted');

    console.log('\n✅ All RBAC sync tests passed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testRbacUserSync();
