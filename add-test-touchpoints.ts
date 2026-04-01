#!/usr/bin/env node

/**
 * Script to add test touchpoints for Tele role testing
 * This creates:
 * - TP1 (Visit) for a client so TP2 (Call) appears
 * - TP2 (Call) for a client so TP3 (Call) appears
 * - TP4 (Visit) for a client so TP5 (Call) appears
 */

import { pool } from './src/db/index.js';

async function main() {

  try {
    console.log('Creating test touchpoints for Tele role testing...\n');

    // Get admin user
    const adminResult = await pool.query(
      `SELECT id, email FROM users WHERE role = 'admin' LIMIT 1`
    );

    if (adminResult.rows.length === 0) {
      console.error('No admin user found!');
      process.exit(1);
    }

    const adminId = adminResult.rows[0].id;
    console.log(`Using admin: ${adminResult.rows[0].email}`);

    // Get first client
    const clientResult = await pool.query(
      `SELECT id, first_name, last_name FROM clients LIMIT 1`
    );

    if (clientResult.rows.length === 0) {
      console.error('No clients found! Please create some clients first.');
      process.exit(1);
    }

    const client = clientResult.rows[0];
    const clientId = client.id;
    console.log(`\nUsing client: ${client.first_name} ${client.last_name} (${clientId})`);

    // Check existing touchpoints
    const existingResult = await pool.query(
      `SELECT touchpoint_number, type FROM touchpoints WHERE client_id = $1 ORDER BY touchpoint_number`,
      [clientId]
    );

    const existingNumbers = existingResult.rows.map(r => r.touchpoint_number);
    console.log(`\nExisting touchpoints: ${existingNumbers.join(', ') || 'None'}`);

    // Create TP1 (Visit) so TP2 (Call) appears for Tele
    if (!existingNumbers.includes(1)) {
      console.log('\n1. Creating TP1 (Visit)...');
      await pool.query(
        `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status)
         VALUES (gen_random_uuid(), $1, $2, 1, 'Visit', NOW(), 'Initial visit', 'Interested')`,
        [clientId, adminId]
      );
      console.log('   ✓ TP1 (Visit) created - Tele users can now do TP2 (Call)');
    } else {
      console.log('   ✓ TP1 already exists');
    }

    // Create TP2 (Call) so TP3 (Call) appears for Tele
    if (!existingNumbers.includes(2)) {
      console.log('\n2. Creating TP2 (Call)...');
      await pool.query(
        `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status)
         VALUES (gen_random_uuid(), $1, $2, 2, 'Call', NOW(), 'Follow-up call', 'Undecided')`,
        [clientId, adminId]
      );
      console.log('   ✓ TP2 (Call) created - Tele users can now do TP3 (Call)');
    } else {
      console.log('   ✓ TP2 already exists');
    }

    // Create TP3 (Call) so TP4 (Visit) is next (Caravan's job)
    if (!existingNumbers.includes(3)) {
      console.log('\n3. Creating TP3 (Call)...');
      await pool.query(
        `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status)
         VALUES (gen_random_uuid(), $1, $2, 3, 'Call', NOW(), 'Second follow-up', 'Undecided')`,
        [clientId, adminId]
      );
      console.log('   ✓ TP3 (Call) created - Waiting for TP4 (Visit) from Caravan');
    } else {
      console.log('   ✓ TP3 already exists');
    }

    // Create TP4 (Visit) so TP5 (Call) appears for Tele
    if (!existingNumbers.includes(4)) {
      console.log('\n4. Creating TP4 (Visit)...');
      await pool.query(
        `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status)
         VALUES (gen_random_uuid(), $1, $2, 4, 'Visit', NOW(), 'Second visit', 'Interested')`,
        [clientId, adminId]
      );
      console.log('   ✓ TP4 (Visit) created - Tele users can now do TP5 (Call)');
    } else {
      console.log('   ✓ TP4 already exists');
    }

    // Create TP5 (Call) so TP6 (Call) appears for Tele
    if (!existingNumbers.includes(5)) {
      console.log('\n5. Creating TP5 (Call)...');
      await pool.query(
        `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status)
         VALUES (gen_random_uuid(), $1, $2, 5, 'Call', NOW(), 'Third follow-up', 'Undecided')`,
        [clientId, adminId]
      );
      console.log('   ✓ TP5 (Call) created - Tele users can now do TP6 (Call)');
    } else {
      console.log('   ✓ TP5 already exists');
    }

    // Create TP6 (Call) - final Call, then TP7 (Visit) is next
    if (!existingNumbers.includes(6)) {
      console.log('\n6. Creating TP6 (Call)...');
      await pool.query(
        `INSERT INTO touchpoints (id, client_id, user_id, touchpoint_number, type, date, reason, status)
         VALUES (gen_random_uuid(), $1, $2, 6, 'Call', NOW(), 'Final follow-up', 'Completed')`,
        [clientId, adminId]
      );
      console.log('   ✓ TP6 (Call) created - Waiting for TP7 (Visit) from Caravan');
    } else {
      console.log('   ✓ TP6 already exists');
    }

    console.log('\n✅ Test touchpoints created successfully!');
    console.log('\nExpected behavior in My Calls page:');
    console.log('- After TP1: Shows client with TP2 (Call) button');
    console.log('- After TP2: Shows client with TP3 (Call) button');
    console.log('- After TP4: Shows client with TP5 (Call) button');
    console.log('- After TP5: Shows client with TP6 (Call) button');
    console.log('- After TP6: No Call button (TP7 Visit needed from Caravan)');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
