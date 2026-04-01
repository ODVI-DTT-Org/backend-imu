/**
 * Test script to check audit logs table and functionality
 */
import 'dotenv/config';
import { pool } from './src/db/index.js';
import { auditLog, auditAuth, getAuditLogStats } from './src/middleware/audit.js';

async function testAuditLogs() {
  console.log('🔍 Testing Audit Logs...\n');

  try {
    // 1. Check if table exists
    console.log('1. Checking if audit_logs table exists...');
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'audit_logs'
      )
    `);
    console.log(`   Table exists: ${tableExists.rows[0].exists}`);

    if (!tableExists.rows[0].exists) {
      console.log('   ❌ audit_logs table does not exist!');
      return;
    }

    // 2. Check table schema
    console.log('\n2. Checking table schema...');
    const columns = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'audit_logs' ORDER BY ordinal_position
    `);
    console.log('   Columns:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

    // 3. Check current log count
    console.log('\n3. Checking current audit log count...');
    const countResult = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
    console.log(`   Total logs: ${countResult.rows[0].count}`);

    // 4. Show recent logs if any
    if (parseInt(countResult.rows[0].count) > 0) {
      console.log('\n4. Recent audit logs:');
      const recentLogs = await pool.query(`
        SELECT al.id, al.user_id, al.action, al.entity,
               al.entity_id, al.created_at,
               u.first_name, u.last_name, u.email
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ORDER BY al.created_at DESC
        LIMIT 10
      `);
      recentLogs.rows.forEach(log => {
        const userName = log.first_name ? `${log.first_name} ${log.last_name}` : 'System';
        console.log(`   - ${log.created_at}: ${log.action} ${log.entity} by ${userName} (${log.email || 'N/A'})`);
      });
    } else {
      console.log('\n4. No audit logs found. Testing manual log insertion...');

      // 5. Test manual log insertion
      console.log('\n5. Testing manual audit log insertion...');
      try {
        await auditLog({
          userId: '00000000-0000-0000-0000-000000000000', // Test user ID
          action: 'create',
          entity: 'test',
          entityId: 'test-id',
          newValues: { message: 'Test audit log entry' },
          ipAddress: '127.0.0.1',
          userAgent: 'test-script',
          metadata: { source: 'api' }
        });
        console.log('   ✅ Manual log insertion successful');

        // Check count again
        const newCountResult = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
        console.log(`   New total logs: ${newCountResult.rows[0].count}`);
      } catch (error: any) {
        console.log(`   ❌ Manual log insertion failed: ${error.message}`);
      }
    }

    // 6. Get audit log stats
    console.log('\n6. Getting audit log stats...');
    const stats = await getAuditLogStats();
    console.log(`   Total: ${stats.total}`);
    console.log(`   Oldest: ${stats.oldest}`);
    console.log(`   Newest: ${stats.newest}`);
    console.log(`   Size: ${stats.size}`);

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
    console.log('\n✅ Test completed');
  }
}

testAuditLogs();
