/**
 * Test script to check audit logs API endpoint
 */
import 'dotenv/config';
import { pool } from './src/db/index.js';
import { getAuditLogs } from './src/middleware/audit.js';

async function testAuditAPI() {
  console.log('🔍 Testing Audit Logs API...\n');

  try {
    // Test the getAuditLogs function directly
    console.log('1. Testing getAuditLogs function...');
    const result = await getAuditLogs({
      page: 1,
      perPage: 10
    });

    console.log(`   Total logs: ${result.total}`);
    console.log(`   Returned items: ${result.items.length}`);
    console.log('\n2. Recent audit logs:');
    result.items.forEach(log => {
      console.log(`   - ${log.createdAt}: ${log.action} ${log.entity} by ${log.userName}`);
    });

    // Test with filters
    console.log('\n3. Testing with action filter (login)...');
    const loginLogs = await getAuditLogs({
      action: 'login',
      page: 1,
      perPage: 5
    });
    console.log(`   Login logs found: ${loginLogs.total}`);
    loginLogs.items.forEach(log => {
      console.log(`   - ${log.createdAt}: ${log.userName}`);
    });

    // Test with entity filter
    console.log('\n4. Testing with entity filter (user)...');
    const userLogs = await getAuditLogs({
      entity: 'user',
      page: 1,
      perPage: 5
    });
    console.log(`   User logs found: ${userLogs.total}`);
    userLogs.items.forEach(log => {
      console.log(`   - ${log.createdAt}: ${log.action} user by ${log.userName}`);
    });

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
    console.log('\n✅ Test completed');
  }
}

testAuditAPI();
