/**
 * Live Audit Trail Verification Test
 * Tests actual API operations and verifies audit logs are created
 */

const BASE_URL = 'http://localhost:3000';
let authToken = '';

interface TestCase {
  name: string;
  operation: () => Promise<{ success: boolean; entityId?: string; error?: string }>;
}

const results: { name: string; status: string; error?: string }[] = [];

async function login() {
  console.log('🔐 Logging in as admin...');
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@imu.com',
      password: 'admin123'
    })
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  const data = await response.json();
  authToken = data.access_token;
  console.log('✅ Login successful\n');
}

async function getAuditLogCount(entity: string): Promise<number> {
  const response = await fetch(
    `${BASE_URL}/api/audit-logs?entity=${entity}&perPage=1000`,
    { headers: { 'Authorization': `Bearer ${authToken}` } }
  );

  if (!response.ok) {
    console.error('Failed to fetch audit logs:', response.status);
    return 0;
  }

  const data = await response.json();
  return data.items?.length || 0;
}

async function testOperation(name: string, operation: () => Promise<any>, entity: string) {
  console.log(`Testing: ${name}...`);

  try {
    // Get count before
    const beforeCount = await getAuditLogCount(entity);

    // Perform operation
    const result = await operation();

    if (!result.success) {
      results.push({ name, status: 'SKIP', error: result.error });
      console.log(`  ⏭️  Skipped: ${result.error}\n`);
      return;
    }

    // Wait for audit log to be created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get count after
    const afterCount = await getAuditLogCount(entity);

    // Check if audit log was created
    const auditCreated = afterCount > beforeCount;
    const status = auditCreated ? 'PASS' : 'FAIL';

    results.push({ name, status });
    console.log(`  ${status === 'PASS' ? '✅ PASS' : '❌ FAIL'} - Audit log ${auditCreated ? 'created' : 'NOT created'}\n`);

    return result;
  } catch (error: any) {
    results.push({ name, status: 'ERROR', error: error.message });
    console.log(`  ❌ ERROR: ${error.message}\n`);
  }
}

async function runTests() {
  console.log('🧪 Starting Live Audit Trail Verification...\n');
  console.log('━'.repeat(80) + '\n');

  try {
    await login();

    let testUserId = '';
    let testClientId = '';

    // Test 1: Create User
    await testOperation('Users: Create', async () => {
      const response = await fetch(`${BASE_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: `audit-test-${Date.now()}@example.com`,
          first_name: 'Audit',
          last_name: 'Test',
          password: 'Test123!',
          role: 'staff'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message };
      }

      const data = await response.json();
      testUserId = data.id;
      return { success: true, entityId: data.id };
    }, 'user');

    // Test 2: Update User
    if (testUserId) {
      await testOperation('Users: Update', async () => {
        const response = await fetch(`${BASE_URL}/api/users/${testUserId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            first_name: 'Updated',
            last_name: 'User'
          })
        });

        if (!response.ok) {
          const error = await response.json();
          return { success: false, error: error.message };
        }

        return { success: true };
      }, 'user');
    }

    // Test 3: Create Client
    await testOperation('Clients: Create', async () => {
      const response = await fetch(`${BASE_URL}/api/clients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          first_name: 'Audit',
          last_name: 'Client',
          client_type: 'POTENTIAL',
          product_type: 'Pension',
          market_type: 'Urban',
          municipality: 'Test Municipality',
          barangay: 'Test Barangay'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message };
      }

      const data = await response.json();
      testClientId = data.id;
      return { success: true, entityId: data.id };
    }, 'client');

    // Test 4: Update Client
    if (testClientId) {
      await testOperation('Clients: Update', async () => {
        const response = await fetch(`${BASE_URL}/api/clients/${testClientId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            first_name: 'Updated',
            last_name: 'Client'
          })
        });

        if (!response.ok) {
          const error = await response.json();
          return { success: false, error: error.message };
        }

        return { success: true };
      }, 'client');
    }

    // Test 5: Create Group
    await testOperation('Groups: Create', async () => {
      const response = await fetch(`${BASE_URL}/api/groups`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `Audit Test Group ${Date.now()}`,
          description: 'Test group for audit verification'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message };
      }

      return { success: true };
    }, 'group');

    // Test 6: Create Approval
    await testOperation('Approvals: Create', async () => {
      const response = await fetch(`${BASE_URL}/api/approvals`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'client',
          client_id: testClientId || '00000000-0000-0000-0000-000000000000',
          reason: 'Audit test',
          notes: 'Testing audit trail'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message };
      }

      return { success: true };
    }, 'approval');

    // Test 7: Check recent audit logs
    console.log('📊 Checking recent audit logs...\n');

    const auditResponse = await fetch(
      `${BASE_URL}/api/audit-logs?perPage=10`,
      { headers: { 'Authorization': `Bearer ${authToken}` } }
    );

    if (auditResponse.ok) {
      const auditData = await auditResponse.json();
      console.log(`Recent audit logs (${auditData.items?.length || 0} total):`);
      auditData.items?.slice(0, 5).forEach((log: any, i: number) => {
        console.log(`  ${i + 1}. ${log.action.padEnd(10)} ${log.entity.padEnd(15)} ${log.userName || 'System'} - ${new Date(log.createdAt).toLocaleTimeString()}`);
      });
      console.log('');
    }

  } catch (error: any) {
    console.error('❌ Test suite failed:', error.message);
  }

  printResults();
}

function printResults() {
  console.log('━'.repeat(80));
  console.log('\n📊 AUDIT TRAIL VERIFICATION RESULTS\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errors = 0;

  results.forEach(result => {
    let status = '';
    if (result.status === 'PASS') {
      status = '✅ PASS';
      passed++;
    } else if (result.status === 'FAIL') {
      status = '❌ FAIL';
      failed++;
    } else if (result.status === 'SKIP') {
      status = '⏭️  SKIP';
      skipped++;
    } else {
      status = '💥 ERROR';
      errors++;
    }

    console.log(`${result.name.padEnd(30)} ${status}`);
    if (result.error) {
      console.log(`  └─ ${result.error}`);
    }
  });

  console.log('\n' + '━'.repeat(80));
  console.log(`\n📈 SUMMARY:`);
  console.log(`   ✅ Passed:  ${passed}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   💥 Errors:  ${errors}`);

  const total = passed + failed;
  const successRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  console.log(`\n   Success Rate: ${successRate}% (${passed}/${total} tests passed)`);

  if (failed === 0 && errors === 0) {
    console.log('\n🎉 All audit trail tests PASSED! The system is logging correctly.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Check the results above for details.\n');
  }
}

runTests().catch(console.error);
