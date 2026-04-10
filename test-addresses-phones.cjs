/**
 * Test Script for Addresses & Phone Numbers Feature
 * Tests multiple addresses and phone numbers APIs
 */

const { Client } = require('pg');

async function testAddressesAndPhones() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@host:port/database',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to QA2 database');

    // Get test client ID (Maria Santos Cruz with 3 addresses)
    const clientResult = await client.query("SELECT id FROM clients WHERE first_name = 'MARIA' AND last_name = 'CRUZ' LIMIT 1");
    if (clientResult.rows.length === 0) {
      throw new Error('Test client MARIA CRUZ not found. Run setup-test-data.cjs first.');
    }
    const testClientId = clientResult.rows[0].id;
    console.log(`\n📋 Using test client: ${testClientId}`);

    let passedTests = 0;
    let failedTests = 0;

    // ============================================
    // TESTS 1-8: ADDRESSES API
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log('TESTING ADDRESSES API');
    console.log('='.repeat(50));

    // Test 1: List client addresses
    console.log('\n1. Listing client addresses...');
    try {
      const addressesResult = await client.query(`
        SELECT id, client_id, psgc_id, label, street_address, postal_code, is_primary
        FROM addresses
        WHERE client_id = $1 AND deleted_at IS NULL
        ORDER BY is_primary DESC, created_at
      `, [testClientId]);
      if (addressesResult.rows.length > 0) {
        console.log(`   ✅ PASS: Found ${addressesResult.rows.length} addresses`);
        addressesResult.rows.forEach(addr => {
          console.log(`      - ${addr.label} (${addr.is_primary ? 'PRIMARY' : 'secondary'}): ${addr.street_address}`);
        });
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No addresses found');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 2: Get primary address
    console.log('\n2. Getting primary address...');
    try {
      const primaryResult = await client.query(`
        SELECT id, label, street_address
        FROM addresses
        WHERE client_id = $1 AND is_primary = true AND deleted_at IS NULL
      `, [testClientId]);
      if (primaryResult.rows.length > 0) {
        console.log(`   ✅ PASS: Primary address is ${primaryResult.rows[0].label}: ${primaryResult.rows[0].street_address}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No primary address found');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 3: Create new address
    console.log('\n3. Creating new address...');
    let newAddressId = null;
    try {
      const addressResult = await client.query(`
        INSERT INTO addresses (id, client_id, psgc_id, label, street_address, postal_code, is_primary)
        VALUES (gen_random_uuid(), $1, 915001, 'Vacation', '789 Beach Rd', '1000', false)
        RETURNING id
      `, [testClientId]);
      newAddressId = addressResult.rows[0].id;
      console.log(`   ✅ PASS: Address created with ID: ${newAddressId}`);
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 4: Update address
    console.log('\n4. Updating address...');
    try {
      const updateResult = await client.query(`
        UPDATE addresses
        SET street_address = '789 Updated Beach Rd'
        WHERE id = $1
        RETURNING id
      `, [newAddressId]);
      if (updateResult.rows.length > 0) {
        console.log(`   ✅ PASS: Address updated: ${updateResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No addresses updated');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 5: Set address as primary
    console.log('\n5. Setting address as primary...');
    try {
      // First, unset all primary addresses for this client
      await client.query(`
        UPDATE addresses
        SET is_primary = false
        WHERE client_id = $1 AND is_primary = true
      `, [testClientId]);

      // Then set the new address as primary
      const primaryResult = await client.query(`
        UPDATE addresses
        SET is_primary = true
        WHERE id = $1
        RETURNING id
      `, [newAddressId]);
      if (primaryResult.rows.length > 0) {
        console.log(`   ✅ PASS: Address set as primary: ${primaryResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No addresses updated');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 6: Verify only one primary address exists
    console.log('\n6. Verifying single primary address...');
    try {
      const countResult = await client.query(`
        SELECT COUNT(*) as count
        FROM addresses
        WHERE client_id = $1 AND is_primary = true AND deleted_at IS NULL
      `, [testClientId]);
      if (parseInt(countResult.rows[0].count) === 1) {
        console.log(`   ✅ PASS: Exactly 1 primary address exists`);
        passedTests++;
      } else {
        console.log(`   ❌ FAIL: Found ${countResult.rows[0].count} primary addresses (expected 1)`);
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 7: Soft delete address
    console.log('\n7. Soft deleting address...');
    try {
      const deleteResult = await client.query(`
        UPDATE addresses
        SET deleted_at = NOW()
        WHERE id = $1
        RETURNING id
      `, [newAddressId]);
      if (deleteResult.rows.length > 0) {
        console.log(`   ✅ PASS: Address soft deleted: ${deleteResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No addresses deleted');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 8: Verify soft deleted address is not returned
    console.log('\n8. Verifying soft deleted address is filtered...');
    try {
      const countResult = await client.query(`
        SELECT COUNT(*) as count
        FROM addresses
        WHERE id = $1 AND deleted_at IS NULL
      `, [newAddressId]);
      if (parseInt(countResult.rows[0].count) === 0) {
        console.log(`   ✅ PASS: Soft deleted address is filtered out`);
        passedTests++;
      } else {
        console.log(`   ❌ FAIL: Soft deleted address is still returned`);
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // ============================================
    // TESTS 9-16: PHONE NUMBERS API
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log('TESTING PHONE NUMBERS API');
    console.log('='.repeat(50));

    // Test 9: List client phone numbers
    console.log('\n9. Listing client phone numbers...');
    try {
      const phonesResult = await client.query(`
        SELECT id, client_id, label, number, is_primary
        FROM phone_numbers
        WHERE client_id = $1 AND deleted_at IS NULL
        ORDER BY is_primary DESC, created_at
      `, [testClientId]);
      if (phonesResult.rows.length > 0) {
        console.log(`   ✅ PASS: Found ${phonesResult.rows.length} phone numbers`);
        phonesResult.rows.forEach(phone => {
          console.log(`      - ${phone.label} (${phone.is_primary ? 'PRIMARY' : 'secondary'}): ${phone.number}`);
        });
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No phone numbers found');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 10: Get primary phone number
    console.log('\n10. Getting primary phone number...');
    try {
      const primaryResult = await client.query(`
        SELECT id, label, number
        FROM phone_numbers
        WHERE client_id = $1 AND is_primary = true AND deleted_at IS NULL
      `, [testClientId]);
      if (primaryResult.rows.length > 0) {
        console.log(`   ✅ PASS: Primary phone is ${primaryResult.rows[0].label}: ${primaryResult.rows[0].number}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No primary phone number found');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 11: Create new phone number
    console.log('\n11. Creating new phone number...');
    let newPhoneId = null;
    try {
      const phoneResult = await client.query(`
        INSERT INTO phone_numbers (id, client_id, label, number, is_primary)
        VALUES (gen_random_uuid(), $1, 'Work', '02-88888888', false)
        RETURNING id
      `, [testClientId]);
      newPhoneId = phoneResult.rows[0].id;
      console.log(`   ✅ PASS: Phone number created with ID: ${newPhoneId}`);
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 12: Update phone number
    console.log('\n12. Updating phone number...');
    try {
      const updateResult = await client.query(`
        UPDATE phone_numbers
        SET number = '02-99999999'
        WHERE id = $1
        RETURNING id
      `, [newPhoneId]);
      if (updateResult.rows.length > 0) {
        console.log(`   ✅ PASS: Phone number updated: ${updateResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No phone numbers updated');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 13: Set phone number as primary
    console.log('\n13. Setting phone number as primary...');
    try {
      // First, unset all primary phone numbers for this client
      await client.query(`
        UPDATE phone_numbers
        SET is_primary = false
        WHERE client_id = $1 AND is_primary = true
      `, [testClientId]);

      // Then set the new phone as primary
      const primaryResult = await client.query(`
        UPDATE phone_numbers
        SET is_primary = true
        WHERE id = $1
        RETURNING id
      `, [newPhoneId]);
      if (primaryResult.rows.length > 0) {
        console.log(`   ✅ PASS: Phone number set as primary: ${primaryResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No phone numbers updated');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 14: Verify only one primary phone number exists
    console.log('\n14. Verifying single primary phone number...');
    try {
      const countResult = await client.query(`
        SELECT COUNT(*) as count
        FROM phone_numbers
        WHERE client_id = $1 AND is_primary = true AND deleted_at IS NULL
      `, [testClientId]);
      if (parseInt(countResult.rows[0].count) === 1) {
        console.log(`   ✅ PASS: Exactly 1 primary phone number exists`);
        passedTests++;
      } else {
        console.log(`   ❌ FAIL: Found ${countResult.rows[0].count} primary phone numbers (expected 1)`);
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 15: Soft delete phone number
    console.log('\n15. Soft deleting phone number...');
    try {
      const deleteResult = await client.query(`
        UPDATE phone_numbers
        SET deleted_at = NOW()
        WHERE id = $1
        RETURNING id
      `, [newPhoneId]);
      if (deleteResult.rows.length > 0) {
        console.log(`   ✅ PASS: Phone number soft deleted: ${deleteResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No phone numbers deleted');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 16: Verify soft deleted phone number is not returned
    console.log('\n16. Verifying soft deleted phone number is filtered...');
    try {
      const countResult = await client.query(`
        SELECT COUNT(*) as count
        FROM phone_numbers
        WHERE id = $1 AND deleted_at IS NULL
      `, [newPhoneId]);
      if (parseInt(countResult.rows[0].count) === 0) {
        console.log(`   ✅ PASS: Soft deleted phone number is filtered out`);
        passedTests++;
      } else {
        console.log(`   ❌ FAIL: Soft deleted phone number is still returned`);
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // ============================================
    // TEST SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${passedTests + failedTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);

    if (failedTests === 0) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }

  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

testAddressesAndPhones().catch(console.error);
