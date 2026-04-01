#!/usr/bin/env tsx
/**
 * Pre-Migration Validation Script
 *
 * This script validates the database state before running the Tele role migrations.
 * It checks for potential issues that could cause migration failures.
 *
 * Run this before executing migrations 026-029:
 *   tsx backend/scripts/validate-pre-migration.ts
 */

import { pool } from '../src/db/index.js';

interface ValidationResult {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
}

const results: ValidationResult[] = [];

async function addResult(check: string, status: 'pass' | 'warn' | 'fail', message: string, details?: any) {
  results.push({ check, status, message, details });
  console.log(`[${status.toUpperCase()}] ${check}: ${message}`);
  if (details) {
    console.log('  Details:', JSON.stringify(details, null, 2));
  }
}

async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      )`,
      [tableName]
    );
    return result.rows[0].exists;
  } catch (error) {
    return false;
  }
}

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      )`,
      [tableName, columnName]
    );
    return result.rows[0].exists;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Pre-Migration Validation for Tele Role Feature');
  console.log('='.repeat(60));
  console.log();

  try {
    // Check 1: Database connection
    console.log('Checking database connection...');
    await pool.query('SELECT 1');
    await addResult(
      'Database Connection',
      'pass',
      'Successfully connected to database'
    );
    console.log();

    // Check 2: Required tables exist
    console.log('Checking required tables...');
    const requiredTables = ['users', 'clients', 'touchpoints', 'approvals'];
    for (const table of requiredTables) {
      const exists = await checkTableExists(table);
      if (exists) {
        await addResult(
          `Table: ${table}`,
          'pass',
          `Table ${table} exists`
        );
      } else {
        await addResult(
          `Table: ${table}`,
          'fail',
          `Required table ${table} does not exist`
        );
      }
    }
    console.log();

    // Check 3: Touchpoints table structure
    console.log('Checking touchpoints table structure...');
    const hasCaravanId = await checkColumnExists('touchpoints', 'caravan_id');
    const hasUserId = await checkColumnExists('touchpoints', 'user_id');
    const hasEditStatus = await checkColumnExists('touchpoints', 'edit_status');
    const hasProposedChanges = await checkColumnExists('touchpoints', 'proposed_changes');
    const hasRejectionReason = await checkColumnExists('touchpoints', 'rejection_reason');

    if (hasCaravanId) {
      await addResult(
        'Touchpoints: caravan_id column',
        'pass',
        'caravan_id column exists (will be renamed to user_id in migration 027)'
      );
    } else if (hasUserId) {
      await addResult(
        'Touchpoints: user_id column',
        'pass',
        'user_id column exists (migration 027 may have already run)'
      );
    } else {
      await addResult(
        'Touchpoints: user_id/caravan_id column',
        'fail',
        'Neither caravan_id nor user_id column found in touchpoints table'
      );
    }

    if (hasEditStatus) {
      const countResult = await pool.query(
        "SELECT COUNT(*) as count FROM touchpoints WHERE edit_status IS NOT NULL"
      );
      const count = parseInt(countResult.rows[0].count);
      if (count > 0) {
        await addResult(
          'Touchpoints: edit_status data',
          'warn',
          `Found ${count} touchpoints with edit_status (will be archived in migration 028)`,
          { count }
        );
      } else {
        await addResult(
          'Touchpoints: edit_status column',
          'pass',
          'edit_status column exists but no data (safe to remove)'
        );
      }
    } else {
      await addResult(
        'Touchpoints: edit_status column',
        'pass',
        'edit_status column does not exist (migration 028 may have already run)'
      );
    }

    if (hasProposedChanges) {
      const countResult = await pool.query(
        "SELECT COUNT(*) as count FROM touchpoints WHERE proposed_changes IS NOT NULL"
      );
      const count = parseInt(countResult.rows[0].count);
      if (count > 0) {
        await addResult(
          'Touchpoints: proposed_changes data',
          'warn',
          `Found ${count} touchpoints with proposed_changes (will be processed in migration 028)`,
          { count }
        );
      } else {
        await addResult(
          'Touchpoints: proposed_changes column',
          'pass',
          'proposed_changes column exists but no data'
        );
      }
    }
    console.log();

    // Check 4: Users table role constraints
    console.log('Checking users table role constraints...');
    const usersResult = await pool.query(
      "SELECT DISTINCT role FROM users ORDER BY role"
    );
    const existingRoles = usersResult.rows.map(row => row.role);
    await addResult(
      'Users: existing roles',
      'pass',
      `Found roles: ${existingRoles.join(', ')}`,
      { roles: existingRoles }
    );

    if (existingRoles.includes('field_agent')) {
      const countResult = await pool.query(
        "SELECT COUNT(*) as count FROM users WHERE role = 'field_agent'"
      );
      const count = parseInt(countResult.rows[0].count);
      await addResult(
        'Users: field_agent role',
        'warn',
        `Found ${count} users with role='field_agent' (will need manual update to 'caravan')`,
        { count }
      );
    }

    if (existingRoles.includes('caravan')) {
      await addResult(
        'Users: caravan role',
        'pass',
        'caravan role exists (migration 026 may have already run)'
      );
    }

    if (existingRoles.includes('tele')) {
      await addResult(
        'Users: tele role',
        'pass',
        'tele role exists (migration 026 may have already run)'
      );
    }
    console.log();

    // Check 5: Approvals table
    console.log('Checking approvals table...');
    const approvalTypesResult = await pool.query(
      "SELECT DISTINCT type FROM approvals ORDER BY type"
    );
    const approvalTypes = approvalTypesResult.rows.map(row => row.type);
    await addResult(
      'Approvals: existing types',
      'pass',
      `Found types: ${approvalTypes.join(', ') || 'none'}`,
      { types: approvalTypes }
    );

    if (approvalTypes.includes('touchpoint')) {
      const countResult = await pool.query(
        "SELECT COUNT(*) as count FROM approvals WHERE type = 'touchpoint'"
      );
      const count = parseInt(countResult.rows[0].count);
      await addResult(
        'Approvals: touchpoint type',
        'warn',
        `Found ${count} approvals with type='touchpoint' (approval system is being removed)`,
        { count }
      );
    }
    console.log();

    // Check 6: Tele assignments table
    console.log('Checking tele_assignments table...');
    const teleAssignmentsExists = await checkTableExists('tele_assignments');
    if (teleAssignmentsExists) {
      await addResult(
        'Table: tele_assignments',
        'pass',
        'tele_assignments table exists (migration 029 may have already run)'
      );
    } else {
      await addResult(
        'Table: tele_assignments',
        'pass',
        'tele_assignments table does not exist (will be created in migration 029)'
      );
    }
    console.log();

    // Check 7: Data consistency
    console.log('Checking data consistency...');
    const orphanedTouchpoints = await pool.query(
      `SELECT COUNT(*) as count FROM touchpoints t
       LEFT JOIN users u ON u.id = t.caravan_id
       WHERE t.caravan_id IS NOT NULL AND u.id IS NULL`
    );
    if (parseInt(orphanedTouchpoints.rows[0].count) > 0) {
      await addResult(
        'Data: orphaned touchpoints',
        'warn',
        `Found ${orphanedTouchpoints.rows[0].count} touchpoints with invalid caravan_id`,
        { count: parseInt(orphanedTouchpoints.rows[0].count) }
      );
    } else {
      await addResult(
        'Data: orphaned touchpoints',
        'pass',
        'No orphaned touchpoints found'
      );
    }

    const orphanedApprovals = await pool.query(
      `SELECT COUNT(*) as count FROM approvals a
       LEFT JOIN users u ON u.id = a.caravan_id
       WHERE a.caravan_id IS NOT NULL AND u.id IS NULL`
    );
    if (parseInt(orphanedApprovals.rows[0].count) > 0) {
      await addResult(
        'Data: orphaned approvals',
        'warn',
        `Found ${orphanedApprovals.rows[0].count} approvals with invalid caravan_id`,
        { count: parseInt(orphanedApprovals.rows[0].count) }
      );
    } else {
      await addResult(
        'Data: orphaned approvals',
        'pass',
        'No orphaned approvals found'
      );
    }
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(60));

    const passCount = results.filter(r => r.status === 'pass').length;
    const warnCount = results.filter(r => r.status === 'warn').length;
    const failCount = results.filter(r => r.status === 'fail').length;

    console.log(`Total checks: ${results.length}`);
    console.log(`Passed: ${passCount}`);
    console.log(`Warnings: ${warnCount}`);
    console.log(`Failed: ${failCount}`);
    console.log();

    if (failCount > 0) {
      console.log('❌ VALIDATION FAILED');
      console.log('Please fix the failed checks before running migrations.');
      process.exit(1);
    } else if (warnCount > 0) {
      console.log('⚠️  VALIDATION PASSED WITH WARNINGS');
      console.log('You can proceed with migrations, but review the warnings above.');
      console.log();
      console.log('Recommended actions:');
      results
        .filter(r => r.status === 'warn')
        .forEach(r => {
          console.log(`  - ${r.check}: ${r.message}`);
        });
      process.exit(0);
    } else {
      console.log('✅ VALIDATION PASSED');
      console.log('You can safely proceed with migrations 026-029.');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error during validation:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
