/**
 * Script to check audit_logs table and add test entries
 */

import { pool } from '../src/db/index.js';
import { auditLog } from '../src/middleware/audit.js';

async function checkAuditLogs() {
  try {
    console.log('Checking audit_logs table...');

    // Check if table exists
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_logs'
    `);

    if (tables.rows.length === 0) {
      console.log('❌ audit_logs table does not exist!');
      return;
    }

    console.log('✅ audit_logs table exists');

    // Get count
    const count = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
    console.log(`📊 Total audit logs: ${count.rows[0].count}`);

    // Get recent entries
    const recent = await pool.query(`
      SELECT al.*, u.first_name, u.last_name, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT 5
    `);

    console.log('\n📝 Recent audit logs:');
    if (recent.rows.length === 0) {
      console.log('  No audit logs found. Creating test entry...');

      // Create a test audit log
      await auditLog({
        userId: null,
        action: 'create',
        entity: 'test',
        entityId: null,
        newValues: { message: 'Test audit log entry' },
        metadata: { test: true }
      });

      console.log('✅ Test audit log created');

      // Check again
      const newCount = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
      console.log(`📊 Total audit logs after test: ${newCount.rows[0].count}`);
    } else {
      recent.rows.forEach(row => {
        console.log(`  [${row.created_at}] ${row.action} ${row.entity} by ${row.user_email || 'System'}`);
      });
    }

    // Check by entity
    const byEntity = await pool.query(`
      SELECT entity, action, COUNT(*) as count
      FROM audit_logs
      GROUP BY entity, action
      ORDER BY count DESC
    `);

    console.log('\n📊 Audit logs by entity and action:');
    byEntity.rows.forEach(row => {
      console.log(`  ${row.entity}.${row.action}: ${row.count}`);
    });

  } catch (error) {
    console.error('❌ Error checking audit logs:', error);
  } finally {
    await pool.end();
  }
}

checkAuditLogs();
