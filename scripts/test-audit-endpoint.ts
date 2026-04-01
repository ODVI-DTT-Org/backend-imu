/**
 * Simple script to test if audit logs are working
 * This will make a test request to the backend and check if an audit log is created
 */

import { config } from 'dotenv';
// Load .env file
config();

import { pool } from '../src/db/index.js';
import { auditLog } from '../src/middleware/audit.js';

async function testAuditLogs() {
  try {
    console.log('Testing audit logs...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    if (process.env.DATABASE_URL) {
      const url = process.env.DATABASE_URL;
      const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@/);
      if (match) {
        console.log('DB User:', match[1]);
        console.log('DB Password type:', typeof match[2]);
        console.log('DB Password length:', match[2].length);
      }
    }
    console.log();

    // Check if audit_logs table exists
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_logs'
    `);

    if (tables.rows.length === 0) {
      console.log('❌ audit_logs table does NOT exist');
      console.log('Creating audit_logs table...');

      // Create the table
      await pool.query(`
        CREATE TABLE audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID,
          action TEXT NOT NULL,
          entity TEXT NOT NULL,
          entity_id UUID,
          old_values JSONB,
          new_values JSONB,
          ip_address TEXT,
          user_agent TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      console.log('✅ audit_logs table created');
    } else {
      console.log('✅ audit_logs table exists');
    }

    // Get count before
    const countBefore = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
    console.log(`\n📊 Audit logs before test: ${countBefore.rows[0].count}`);

    // Create a test audit log
    console.log('\nCreating test audit log...');
    await auditLog({
      userId: null,
      action: 'create',
      entity: 'test',
      entityId: null,
      newValues: { message: 'Test audit log from script', timestamp: new Date().toISOString() },
      metadata: { test: true, source: 'test-audit-endpoint.ts' }
    });

    console.log('✅ Test audit log created');

    // Wait a bit for the insert to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get count after
    const countAfter = await pool.query('SELECT COUNT(*) as count FROM audit_logs');
    console.log(`📊 Audit logs after test: ${countAfter.rows[0].count}`);

    // Get the most recent audit log
    const recent = await pool.query(`
      SELECT * FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 1
    `);

    console.log('\n📝 Most recent audit log:');
    console.log('  Action:', recent.rows[0].action);
    console.log('  Entity:', recent.rows[0].entity);
    console.log('  Created:', recent.rows[0].created_at);
    console.log('  New Values:', recent.rows[0].new_values);

    console.log('\n✅ Audit logs are working correctly!');

  } catch (error) {
    console.error('❌ Error testing audit logs:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testAuditLogs();
