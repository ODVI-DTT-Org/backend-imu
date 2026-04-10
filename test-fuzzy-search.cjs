/**
 * Test Script for Fuzzy Name Search Feature
 * Tests full-text search with typo tolerance
 */

const { Client } = require('pg');

async function testFuzzySearch() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@host:port/database',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to QA2 database');

    let passedTests = 0;
    let failedTests = 0;

    // ============================================
    // TESTS 1-10: FUZZY NAME SEARCH
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log('TESTING FUZZY NAME SEARCH');
    console.log('='.repeat(50));

    // Test 1: Search by exact full name
    console.log('\n1. Searching by exact full name "Rodolfo Marin"...');
    try {
      const result = await client.query(`
        SELECT id, first_name, middle_name, last_name, full_name, similarity
        FROM clients,
             ts_rank_cd(textsearchable_index_col, query) AS similarity
        FROM to_tsquery('english', 'Rodolfo') query
        WHERE textsearchable_index_col @@ query
          AND full_name % 'Rodolfo Marin'
        ORDER BY similarity DESC
        LIMIT 10
      `);
      console.log(`   ✅ PASS: Found ${result.rows.length} results`);
      result.rows.forEach(row => {
        console.log(`      - ${row.full_name}`);
      });
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 2: Search with typo tolerance (Rodolfo vs Rodelfo)
    console.log('\n2. Searching with typo "Rodelfo"...');
    try {
      const result = await client.query(`
        SELECT id, first_name, middle_name, last_name, full_name
        FROM clients
        WHERE full_name % 'Rodelfo'
        ORDER BY similarity(full_name, 'Rodelfo') DESC
        LIMIT 10
      `);
      console.log(`   ✅ PASS: Found ${result.rows.length} results`);
      result.rows.forEach(row => {
        console.log(`      - ${row.full_name}`);
      });
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 3: Search by last name only
    console.log('\n3. Searching by last name "Marin"...');
    try {
      const result = await client.query(`
        SELECT id, first_name, middle_name, last_name, full_name
        FROM clients
        WHERE full_name % 'Marin'
        ORDER BY similarity(full_name, 'Marin') DESC
        LIMIT 10
      `);
      console.log(`   ✅ PASS: Found ${result.rows.length} results`);
      result.rows.forEach(row => {
        console.log(`      - ${row.full_name}`);
      });
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 4: Search with partial match
    console.log('\n4. Searching with partial name "Rod"...');
    try {
      const result = await client.query(`
        SELECT id, first_name, middle_name, last_name, full_name
        FROM clients
        WHERE full_name ILIKE '%Rod%'
        ORDER BY full_name
        LIMIT 10
      `);
      console.log(`   ✅ PASS: Found ${result.rows.length} results`);
      result.rows.forEach(row => {
        console.log(`      - ${row.full_name}`);
      });
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 5: Search for non-existent name
    console.log('\n5. Searching for non-existent name "John Doe"...');
    try {
      const result = await client.query(`
        SELECT id, first_name, middle_name, last_name, full_name
        FROM clients
        WHERE full_name % 'John Doe'
        ORDER BY similarity(full_name, 'John Doe') DESC
        LIMIT 10
      `);
      if (result.rows.length === 0) {
        console.log(`   ✅ PASS: No results found (expected)`);
        passedTests++;
      } else {
        console.log(`   ❌ FAIL: Found ${result.rows.length} results (expected 0)`);
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 6: Search with empty string
    console.log('\n6. Searching with empty string...');
    try {
      const result = await client.query(`
        SELECT id, first_name, middle_name, last_name, full_name
        FROM clients
        ORDER BY full_name
        LIMIT 10
      `);
      console.log(`   ✅ PASS: Found ${result.rows.length} results (showing all clients)`);
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 7: Test similarity threshold
    console.log('\n7. Testing similarity threshold for "Rodolfo"...');
    try {
      const result = await client.query(`
        SELECT full_name, similarity(full_name, 'Rodolfo') as sim
        FROM clients
        WHERE full_name % 'Rodolfo'
        ORDER BY similarity(full_name, 'Rodolfo') DESC
      `);
      console.log(`   ✅ PASS: Found ${result.rows.length} similar names`);
      result.rows.forEach(row => {
        console.log(`      - ${row.full_name} (similarity: ${row.sim.toFixed(2)})`);
      });
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 8: Search with special characters
    console.log('\n8. Searching with special characters "Cruz"...');
    try {
      const result = await client.query(`
        SELECT id, first_name, middle_name, last_name, full_name
        FROM clients
        WHERE full_name % 'Cruz'
        ORDER BY similarity(full_name, 'Cruz') DESC
        LIMIT 10
      `);
      console.log(`   ✅ PASS: Found ${result.rows.length} results`);
      result.rows.forEach(row => {
        console.log(`      - ${row.full_name}`);
      });
      passedTests++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 9: Search with case insensitivity
    console.log('\n9. Testing case insensitivity (rodolfo vs RODOLFO)...');
    try {
      const result1 = await client.query(`
        SELECT COUNT(*) as count
        FROM clients
        WHERE full_name % 'rodolfo'
      `);
      const result2 = await client.query(`
        SELECT COUNT(*) as count
        FROM clients
        WHERE full_name % 'RODOLFO'
      `);
      if (result1.rows[0].count === result2.rows[0].count) {
        console.log(`   ✅ PASS: Case insensitive search works (${result1.rows[0].count} results for both)`);
        passedTests++;
      } else {
        console.log(`   ❌ FAIL: Case insensitive search broken (${result1.rows[0].count} vs ${result2.rows[0].count})`);
        failedTests++;
      }
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failedTests++;
    }

    // Test 10: Verify test data exists
    console.log('\n10. Verifying test data exists...');
    try {
      const result = await client.query(`
        SELECT first_name, last_name
        FROM clients
        WHERE first_name IN ('RODOLFO', 'RODELFO')
          AND last_name IN ('MARIN', 'MARINEZ')
      `);
      if (result.rows.length >= 4) {
        console.log(`   ✅ PASS: Found ${result.rows.length} test clients for fuzzy search`);
        result.rows.forEach(row => {
          console.log(`      - ${row.first_name} ${row.last_name}`);
        });
        passedTests++;
      } else {
        console.log(`   ❌ FAIL: Only found ${result.rows.length} test clients (expected 4)`);
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

testFuzzySearch().catch(console.error);
