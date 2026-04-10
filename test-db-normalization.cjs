/**
 * Test Script for Database Normalization Feature
 * Tests visits, calls, and releases APIs
 */

const { Client } = require('pg');

async function testDatabaseNormalization() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@host:port/database',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to QA2 database');

    // Get test client ID
    const clientResult = await client.query("SELECT id FROM clients WHERE first_name = 'JUAN' AND last_name = 'DELACRUZ' LIMIT 1");
    if (clientResult.rows.length === 0) {
      throw new Error('Test client JUAN DELACRUZ not found. Run setup-test-data.cjs first.');
    }
    const testClientId = clientResult.rows[0].id;
    console.log(`\n📋 Using test client: ${testClientId}`);

    // Get test user ID
    const userResult = await client.query("SELECT id FROM users WHERE email = 'admin@test.com' LIMIT 1");
    if (userResult.rows.length === 0) {
      throw new Error('Test user admin@test.com not found. Run setup-test-data.cjs first.');
    }
    const testUserId = userResult.rows[0].id;
    console.log(`📋 Using test user: ${testUserId}`);

    let passedTests = 0;
    let failedTests = 0;
    let visitId = null;

    // ============================================
    // TESTS 1-5: VISITS API
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log('TESTING VISITS API');
    console.log('='.repeat(50));

    // Test 1: Create visit
    console.log('\n1. Creating visit...');
    try {
      const now = new Date().toISOString();
      const later = new Date(Date.now() + 30 * 60000).toISOString();
      const visitResult = await client.query(`
        INSERT INTO visits (client_id, user_id, time_arrival, time_departure, latitude, longitude, address, notes, photo_url)
        VALUES ($1, $2, $3, $4, 14.5847, 121.0557, '123 Test St', 'Initial visit', 'https://example.com/photo.jpg')
        RETURNING id
      `, [testClientId, testUserId, now, later]);
      visitId = visitResult.rows[0].id;
      console.log(`   ✅ PASS: Visit created with ID: ${visitId}`);
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 2: Create visit with invalid time_departure (before time_arrival)
    console.log('\n2. Creating visit with invalid time_departure...');
    try {
      const now = new Date().toISOString();
      const later = new Date(Date.now() + 60 * 60000).toISOString();
      await client.query(`
        INSERT INTO visits (client_id, user_id, time_arrival, time_departure, latitude, longitude, photo_url)
        VALUES ($1, $2, $3, $4, 14.5847, 121.0557, 'https://example.com/photo.jpg')
      `, [testClientId, testUserId, later, now]);
      console.log('   ❌ FAIL: Should have rejected invalid time_departure');
      failedTests++;
    } catch (err) {
      // Note: The database doesn't have a constraint for this, so it will pass
      console.log(`   ⚠️  Note: Database allows time_departure before time_arrival: ${err.message}`);
      passedTests++;
    }

    // Test 3: Get visit by ID
    console.log('\n3. Getting visit by ID...');
    try {
      const visitResult = await client.query(`
        SELECT id, client_id, user_id, time_arrival, time_departure, latitude, longitude, address, notes
        FROM visits
        WHERE id = $1
      `, [visitId]);
      if (visitResult.rows.length > 0) {
        console.log(`   ✅ PASS: Retrieved visit with ID: ${visitResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No visits found');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 4: Update visit
    console.log('\n4. Updating visit...');
    try {
      const later = new Date(Date.now() + 60 * 60000).toISOString();
      const visitResult = await client.query(`
        UPDATE visits
        SET notes = 'Updated notes', time_departure = $2
        WHERE id = $1
        RETURNING id
      `, [visitId, later]);
      if (visitResult.rows.length > 0) {
        console.log(`   ✅ PASS: Visit updated: ${visitResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No visits updated');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 5: Delete visit (hard delete - no deleted_at column)
    console.log('\n5. Deleting visit...');
    try {
      const visitResult = await client.query(`
        DELETE FROM visits
        WHERE id = $1
        RETURNING id
      `, [visitId]);
      if (visitResult.rows.length > 0) {
        console.log(`   ✅ PASS: Visit deleted: ${visitResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No visits deleted');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // ============================================
    // TESTS 6-10: CALLS API
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log('TESTING CALLS API');
    console.log('='.repeat(50));

    let callId = null;

    // Test 6: Create call
    console.log('\n6. Creating call...');
    try {
      const callResult = await client.query(`
        INSERT INTO calls (client_id, user_id, phone_number, duration, notes, status, dial_time)
        VALUES ($1, $2, '09181234567', 15, 'Initial call', 'Interested', NOW())
        RETURNING id
      `, [testClientId, testUserId]);
      callId = callResult.rows[0].id;
      console.log(`   ✅ PASS: Call created with ID: ${callId}`);
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 7: Create call with invalid duration (negative)
    console.log('\n7. Creating call with invalid duration...');
    try {
      await client.query(`
        INSERT INTO calls (client_id, user_id, phone_number, duration, notes, dial_time)
        VALUES ($1, $2, '09181234567', -5, 'Test', NOW())
      `, [testClientId, testUserId]);
      console.log('   ❌ FAIL: Should have rejected negative duration');
      failedTests++;
    } catch (err) {
      console.log(`   ✅ PASS: Correctly rejected negative duration: ${err.message}`);
      passedTests++;
    }

    // Test 8: Get call by ID
    console.log('\n8. Getting call by ID...');
    try {
      const callResult = await client.query(`
        SELECT id, client_id, user_id, phone_number, duration, notes, status
        FROM calls
        WHERE id = $1
      `, [callId]);
      if (callResult.rows.length > 0) {
        console.log(`   ✅ PASS: Retrieved call with ID: ${callResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No calls found');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 9: Update call
    console.log('\n9. Updating call...');
    try {
      const callResult = await client.query(`
        UPDATE calls
        SET notes = 'Updated notes', status = 'Completed'
        WHERE id = $1
        RETURNING id
      `, [callId]);
      if (callResult.rows.length > 0) {
        console.log(`   ✅ PASS: Call updated: ${callResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No calls updated');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 10: Delete call (hard delete - no deleted_at column)
    console.log('\n10. Deleting call...');
    try {
      const callResult = await client.query(`
        DELETE FROM calls
        WHERE id = $1
        RETURNING id
      `, [callId]);
      if (callResult.rows.length > 0) {
        console.log(`   ✅ PASS: Call deleted: ${callResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No calls deleted');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // ============================================
    // TESTS 11-15: RELEASES API
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log('TESTING RELEASES API');
    console.log('='.repeat(50));

    // First, create a visit for the release
    let releaseVisitId = null;
    console.log('\nCreating visit for release...');
    try {
      const now = new Date().toISOString();
      const later = new Date(Date.now() + 30 * 60000).toISOString();
      const visitResult = await client.query(`
        INSERT INTO visits (client_id, user_id, time_arrival, time_departure, type, photo_url)
        VALUES ($1, $2, $3, $4, 'release_loan', 'https://example.com/release.jpg')
        RETURNING id
      `, [testClientId, testUserId, now, later]);
      releaseVisitId = visitResult.rows[0].id;
      console.log(`   ✅ Visit created for release: ${releaseVisitId}`);
    } catch (err) {
      console.log(`   ⚠️  Could not create visit for release: ${err.message}`);
    }

    let releaseId = null;

    // Test 11: Create release
    console.log('\n11. Creating loan release...');
    try {
      const releaseResult = await client.query(`
        INSERT INTO releases (client_id, user_id, visit_id, product_type, loan_type, amount, status)
        VALUES ($1, $2, $3, 'PUSU', 'NEW', 50000.00, 'pending')
        RETURNING id
      `, [testClientId, testUserId, releaseVisitId]);
      releaseId = releaseResult.rows[0].id;
      console.log(`   ✅ PASS: Release created with ID: ${releaseId}`);
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 12: Get release by ID
    console.log('\n12. Getting release by ID...');
    try {
      const releaseResult = await client.query(`
        SELECT id, client_id, user_id, visit_id, product_type, loan_type, amount, status
        FROM releases
        WHERE id = $1
      `, [releaseId]);
      if (releaseResult.rows.length > 0) {
        console.log(`   ✅ PASS: Retrieved release with ID: ${releaseResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No releases found');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 13: Update release
    console.log('\n13. Updating release...');
    try {
      const releaseResult = await client.query(`
        UPDATE releases
        SET amount = 55000.00
        WHERE id = $1
        RETURNING id
      `, [releaseId]);
      if (releaseResult.rows.length > 0) {
        console.log(`   ✅ PASS: Release updated: ${releaseResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No releases updated');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 14: Approve release
    console.log('\n14. Approving release...');
    try {
      const releaseResult = await client.query(`
        UPDATE releases
        SET status = 'approved', approved_at = NOW(), approved_by = $2
        WHERE id = $1 AND status = 'pending'
        RETURNING id
      `, [releaseId, testUserId]);
      if (releaseResult.rows.length > 0) {
        console.log(`   ✅ PASS: Release approved: ${releaseResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No releases approved');
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 15: Delete release (hard delete - no deleted_at column)
    console.log('\n15. Deleting release...');
    try {
      const releaseResult = await client.query(`
        DELETE FROM releases
        WHERE id = $1
        RETURNING id
      `, [releaseId]);
      if (releaseResult.rows.length > 0) {
        console.log(`   ✅ PASS: Release deleted: ${releaseResult.rows[0].id}`);
        passedTests++;
      } else {
        console.log('   ❌ FAIL: No releases deleted');
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

testDatabaseNormalization().catch(console.error);
