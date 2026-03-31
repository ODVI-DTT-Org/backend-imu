/**
 * Run Migration 038: Add 5000 client fields
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : undefined,
});

async function runMigration() {
  console.log('=== Running Migration 038: Add 5000 Client Fields ===\n');

  // Read the migration file
  const migrationPath = resolve(__dirname, '../src/migrations/038_add_5000_client_fields.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  try {
    // Split by semi-colon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        await pool.query(statement);
      }
    }

    console.log('\n✅ Migration completed successfully!');

    // Verify the new columns exist
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'clients'
      AND column_name IN (
        'ext_name', 'fullname', 'full_address', 'account_code', 'account_number',
        'rank', 'monthly_pension_amount', 'monthly_pension_gross', 'atm_number',
        'applicable_republic_act', 'unit_code', 'pcni_acct_code', '3g_company',
        '3g_status', 'DMVAL_code', 'DMVAL_name', 'DMVAL_amount', 'next_visit',
        'last_visit', 'client_status', 'legacy_created_by', 'secondary_municipality',
        'secondary_province', 'secondary_full_address'
      )
      ORDER BY column_name;
    `);

    console.log(`\n✅ Verified ${result.rows.length} new columns added to clients table:`);
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().catch(console.error);
