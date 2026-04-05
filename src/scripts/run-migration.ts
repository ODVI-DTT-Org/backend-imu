/**
 * Migration Runner Script
 * Executes SQL migration files against the database
 *
 * Usage: pnpm exec tsx src/scripts/run-migration.ts <migration-file>
 */

import { pool } from '../db/index.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function runMigration(migrationFile: string) {
  const client = await pool.connect();

  try {
    console.log(`📜 Running migration: ${migrationFile}`);

    // Read migration file
    const migrationPath = resolve(process.cwd(), migrationFile);
    const sql = readFileSync(migrationPath, 'utf-8');

    // Begin transaction
    await client.query('BEGIN');

    try {
      // Execute migration
      await client.query(sql);

      // Commit transaction
      await client.query('COMMIT');

      console.log(`✅ Migration completed successfully: ${migrationFile}`);
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error: any) {
    console.error(`❌ Migration failed: ${migrationFile}`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Get migration file from command line argument
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Usage: pnpm exec tsx src/scripts/run-migration.ts <migration-file>');
  console.error('   Example: pnpm exec tsx src/scripts/run-migration.ts src/migrations/048_add_missing_error_logs_columns.sql');
  process.exit(1);
}

// Run migration
runMigration(migrationFile);
