/**
 * Script to check database tables and audit logs
 */

import { pool } from '../src/db/index.js';

async function checkTables() {
  try {
    console.log('Checking database tables...\n');

    // List all tables
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('All tables:');
    result.rows.forEach(row => {
      console.log('  -', row.table_name);
    });

    // Check specifically for audit tables
    const auditTables = result.rows.filter(r => r.table_name.includes('audit') || r.table_name.includes('trail'));
    console.log('\nAudit/Trail tables:', auditTables.map(r => r.table_name));

    // Check audit_logs table if it exists
    const hasAuditLogs = result.rows.find(r => r.table_name === 'audit_logs');
    if (hasAuditLogs) {
      console.log('\n✅ audit_logs table exists');

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
        console.log('  No audit logs found.');
      } else {
        recent.rows.forEach(row => {
          console.log(`  [${row.created_at?.toISOString().slice(0, 19)}] ${row.action} ${row.entity} by ${row.user_email || 'System'}`);
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
    } else {
      console.log('\n❌ audit_logs table does NOT exist');
    }

  } catch (error) {
    console.error('❌ Error checking tables:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkTables();
