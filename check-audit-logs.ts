/**
 * Direct database check for audit logs
 */

import { pool } from './src/db/index.js';

async function checkAuditLogs() {
  try {
    console.log('🔍 Checking audit_logs table...\n');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'audit_logs'
      )
    `);

    console.log('Table exists:', tableCheck.rows[0].exists);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ audit_logs table does not exist!');
      return;
    }

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
    console.log('\nTotal audit logs:', countResult.rows[0].count);

    // Get recent logs
    const recentLogs = await pool.query(`
      SELECT id, action, entity, entity_id, user_id, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 20
    `);

    console.log('\n📋 Recent audit logs:');
    if (recentLogs.rows.length === 0) {
      console.log('  No audit logs found');
    } else {
      recentLogs.rows.forEach((log, i) => {
        console.log(`  ${i+1}. ${log.action.padEnd(10)} ${log.entity.padEnd(15)} User: ${log.user_id || 'System'} ${log.created_at}`);
      });
    }

    // Get logs by entity
    const byEntity = await pool.query(`
      SELECT entity, COUNT(*) as count
      FROM audit_logs
      GROUP BY entity
      ORDER BY count DESC
    `);

    console.log('\n📊 Audit logs by entity:');
    byEntity.rows.forEach(row => {
      console.log(`  ${row.entity.padEnd(20)} ${row.count}`);
    });

    // Get logs by action
    const byAction = await pool.query(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      GROUP BY action
      ORDER BY count DESC
    `);

    console.log('\n📊 Audit logs by action:');
    byAction.rows.forEach(row => {
      console.log(`  ${row.action.padEnd(20)} ${row.count}`);
    });

    // Check for specific entities
    const entities = ['user', 'client', 'itinerary', 'touchpoint', 'group', 'target'];
    console.log('\n🔎 Specific entity checks:');
    for (const entity of entities) {
      const result = await pool.query(
        'SELECT COUNT(*) as count FROM audit_logs WHERE entity = $1',
        [entity]
      );
      console.log(`  ${entity.padEnd(15)} ${result.rows[0].count} logs`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAuditLogs();
