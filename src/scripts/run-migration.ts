/**
 * Migration Runner - Execute SQL migrations directly
 * Usage: npx tsx src/scripts/run-migration.ts <migration-file>
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config } from 'dotenv';

// Load environment variables from .env file
config({ path: path.join(process.cwd(), '.env') });

// SSL configuration for Digital Ocean Managed PostgreSQL
// Same configuration as backend/src/db/index.ts
let sslConfig: { ca: string; rejectUnauthorized: boolean } | { rejectUnauthorized: boolean } | false = false;
let databaseUrl = process.env.DATABASE_URL;

if (databaseUrl?.includes('ondigitalocean.com')) {
  // Add uselibpqcompat=true to make sslmode=require use standard libpq semantics
  if (!databaseUrl.includes('uselibpqcompat=')) {
    databaseUrl += '&uselibpqcompat=true';
  }

  // For DigitalOcean Managed PostgreSQL with self-signed certificates
  const dbCaCert = process.env.DB_CA_CERT;
  if (dbCaCert && dbCaCert.trim().length > 0) {
    sslConfig = {
      ca: dbCaCert.trim().replace(/\\n/g, '\n'),
      rejectUnauthorized: false,
    };
    console.log('✅ Using CA certificate from DB_CA_CERT with rejectUnauthorized: false');
  } else {
    sslConfig = {
      rejectUnauthorized: false,
    };
    console.log('⚠️ No DB_CA_CERT found, using rejectUnauthorized: false only');
  }
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslConfig,
});

async function runMigration(migrationFile: string) {
  const migrationPath = path.join(process.cwd(), 'src', 'migrations', migrationFile);

  console.log(`=== Running Migration: ${migrationFile} ===`);
  console.log(`Path: ${migrationPath}`);

  // Check if migration file exists
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  // Read migration SQL
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log(`\n📜 SQL loaded (${sql.length} characters)`);

  try {
    // Start transaction
    await pool.query('BEGIN');

    // Execute migration
    console.log(`\n⚙️  Executing migration...`);
    await pool.query(sql);

    // Commit transaction
    await pool.query('COMMIT');

    console.log(`\n✅ Migration completed successfully!`);

    // Verify table was created
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'files'
    `);

    if (result.rows.length > 0) {
      console.log(`\n📊 Verification: 'files' table exists!`);
      console.log(`   Columns: ${result.rows.length} row(s)`);
    }

  } catch (error: any) {
    await pool.query('ROLLBACK');
    console.error(`\n❌ Migration failed!`);
    console.error(`Error: ${error.message}`);

    if (error.code) {
      console.error(`Code: ${error.code}`);
    }

    if (error.detail) {
      console.error(`Detail: ${error.detail}`);
    }

    if (error.hint) {
      console.error(`Hint: ${error.hint}`);
    }

    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Get migration file from command line argument
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: npx tsx src/scripts/run-migration.ts <migration-file>');
  console.error('Example: npx tsx src/scripts/run-migration.ts 047_create_files_table.sql');
  process.exit(1);
}

// Run migration
runMigration(migrationFile);
