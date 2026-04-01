#!/usr/bin/env node

/**
 * Script to create test clients with different touchpoint states
 * for Tele role Call button testing
 */

import { pool } from './src/db/index.js';

async function main() {
  const client = await pool.connect();

  try {
    // Get admin user
    const adminResult = await client.query(
      `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
    );

    if (adminResult.rows.length === 0) {
      console.error('No admin user found!');
      process.exit(1);
    }

    const adminId = adminResult.rows[0].id;

    // Client A: Has TP1 completed → should show Call button for TP2
    console.log('Creating Client A (TP1 done, needs TP2 Call)...');
    const clientA = await client.query(
      `INSERT INTO clients (id, first_name, last_name, email, client_type, product_type, market_type, pension_type, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Maria', 'Santos', 'maria.santos@test.com', 'EXISTING', 'LOAN', 'METRO_MANILA', 'SSS', NOW(), NOW())
       RETURNING id`
    );
    await client.query(
      `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 1, 'Visit', NOW(), 'Initial visit', 'Interested', NOW(), NOW())`,
      [clientA.rows[0].id, adminId]
    );
    console.log(`   ✓ Created Maria Santos (ID: ${clientA.rows[0].id})`);

    // Client B: Has TP1, TP2 completed → should show Call button for TP3
    console.log('\nCreating Client B (TP1, TP2 done, needs TP3 Call)...');
    const clientB = await client.query(
      `INSERT INTO clients (id, first_name, last_name, email, client_type, product_type, market_type, pension_type, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Jose', 'Reyes', 'jose.reyes@test.com', 'POTENTIAL', 'CARD', 'PROVINCE', 'GSIS', NOW(), NOW())
       RETURNING id`
    );
    await client.query(
      `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 1, 'Visit', NOW(), 'Initial visit', 'Interested', NOW(), NOW()),
              (gen_random_uuid(), $1, $2, 2, 'Call', NOW(), 'Follow-up call', 'Undecided', NOW(), NOW())`,
      [clientB.rows[0].id, adminId]
    );
    console.log(`   ✓ Created Jose Reyes (ID: ${clientB.rows[0].id})`);

    // Client C: Has TP1-TP4 completed → should show Call button for TP5
    console.log('\nCreating Client C (TP1-TP4 done, needs TP5 Call)...');
    const clientC = await client.query(
      `INSERT INTO clients (id, first_name, last_name, email, client_type, product_type, market_type, pension_type, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Ana', 'Garcia', 'ana.garcia@test.com', 'EXISTING', 'LOAN', 'METRO_MANILA', 'SSS', NOW(), NOW())
       RETURNING id`
    );
    await client.query(
      `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 1, 'Visit', NOW(), 'Initial visit', 'Interested', NOW(), NOW()),
              (gen_random_uuid(), $1, $2, 2, 'Call', NOW(), 'Follow-up call', 'Undecided', NOW(), NOW()),
              (gen_random_uuid(), $1, $2, 3, 'Call', NOW(), 'Second follow-up', 'Undecided', NOW(), NOW()),
              (gen_random_uuid(), $1, $2, 4, 'Visit', NOW(), 'Second visit', 'Interested', NOW(), NOW())`,
      [clientC.rows[0].id, adminId]
    );
    console.log(`   ✓ Created Ana Garcia (ID: ${clientC.rows[0].id})`);

    // Client D: Has TP1-TP5 completed → should show Call button for TP6
    console.log('\nCreating Client D (TP1-TP5 done, needs TP6 Call)...');
    const clientD = await client.query(
      `INSERT INTO clients (id, first_name, last_name, email, client_type, product_type, market_type, pension_type, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Carlos', 'Mendoza', 'carlos.mendoza@test.com', 'POTENTIAL', 'CARD', 'PROVINCE', 'GSIS', NOW(), NOW())
       RETURNING id`
    );
    await client.query(
      `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 1, 'Visit', NOW(), 'Initial visit', 'Interested', NOW(), NOW()),
              (gen_random_uuid(), $1, $2, 2, 'Call', NOW(), 'Follow-up call', 'Undecided', NOW(), NOW()),
              (gen_random_uuid(), $1, $2, 3, 'Call', NOW(), 'Second follow-up', 'Undecided', NOW(), NOW()),
              (gen_random_uuid(), $1, $2, 4, 'Visit', NOW(), 'Second visit', 'Interested', NOW(), NOW()),
              (gen_random_uuid(), $1, $2, 5, 'Call', NOW(), 'Third follow-up', 'Undecided', NOW(), NOW())`,
      [clientD.rows[0].id, adminId]
    );
    console.log(`   ✓ Created Carlos Mendoza (ID: ${clientD.rows[0].id})`);

    console.log('\n✅ Test clients created successfully!');
    console.log('\nExpected Call buttons in My Calls page:');
    console.log('- Maria Santos: TP2 Call button (Next: TP2 Call)');
    console.log('- Jose Reyes: TP3 Call button (Next: TP3 Call)');
    console.log('- Ana Garcia: TP5 Call button (Next: TP5 Call)');
    console.log('- Carlos Mendoza: TP6 Call button (Next: TP6 Call)');
    console.log('\nAll 4 clients should now appear in the My Calls page with Call buttons!');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
