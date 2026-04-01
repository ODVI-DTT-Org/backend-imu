/**
 * Run a specific migration file
 * Usage: npx tsx scripts/run-migration.ts <migration_file>
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false,
});

async function runMigration() {
  const migrationFile = process.argv[2];
  if (!migrationFile) {
    console.error('Usage: npx tsx scripts/run-migration.ts <migration_file>');
    process.exit(1);
  }

  const migrationPath = resolve(__dirname, '../src/migrations', migrationFile);

  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  console.log(`Running migration: ${migrationFile}`);

  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
