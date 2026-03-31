/**
 * Run Migration 038: Add 5000 client fields (Simple version)
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : undefined,
});

// New columns to add
const newColumns = [
  { name: 'ext_name', type: 'TEXT' },
  { name: 'fullname', type: 'TEXT' },
  { name: 'full_address', type: 'TEXT' },
  { name: 'account_code', type: 'TEXT' },
  { name: 'account_number', type: 'TEXT' },
  { name: 'rank', type: 'TEXT' },
  { name: 'monthly_pension_amount', type: 'NUMERIC(12, 2)' },
  { name: 'monthly_pension_gross', type: 'NUMERIC(12, 2)' },
  { name: 'atm_number', type: 'TEXT' },
  { name: 'applicable_republic_act', type: 'TEXT' },
  { name: 'unit_code', type: 'TEXT' },
  { name: 'pcni_acct_code', type: 'TEXT' },
  { name: '3g_company', type: 'TEXT' },
  { name: '3g_status', type: 'TEXT' },
  { name: 'DMVAL_code', type: 'TEXT' },
  { name: 'DMVAL_name', type: 'TEXT' },
  { name: 'DMVAL_amount', type: 'NUMERIC(12, 2)' },
  { name: 'next_visit', type: 'DATE' },
  { name: 'last_visit', type: 'DATE' },
  { name: 'client_status', type: "TEXT CHECK (client_status IN ('active', 'inactive'))" },
  { name: 'legacy_created_by', type: 'TEXT' },
  { name: 'secondary_municipality', type: 'TEXT' },
  { name: 'secondary_province', type: 'TEXT' },
  { name: 'secondary_full_address', type: 'TEXT' },
];

// Indexes to create
const indexes = [
  { columns: ['fullname'], name: 'idx_clients_fullname' },
  { columns: ['account_code'], name: 'idx_clients_account_code' },
  { columns: ['account_number'], name: 'idx_clients_account_number' },
  { columns: ['rank'], name: 'idx_clients_rank' },
  { columns: ['atm_number'], name: 'idx_clients_atm_number' },
  { columns: ['unit_code'], name: 'idx_clients_unit_code' },
  { columns: ['pcni_acct_code'], name: 'idx_clients_pcni_acct_code' },
  { columns: ['client_status'], name: 'idx_clients_client_status' },
  { columns: ['next_visit'], name: 'idx_clients_next_visit' },
  { columns: ['last_visit'], name: 'idx_clients_last_visit' },
  { columns: ['legacy_created_by'], name: 'idx_clients_legacy_created_by' },
];

async function runMigration() {
  console.log('=== Running Migration 038: Add 5000 Client Fields ===\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add each column if it doesn't exist
    for (const column of newColumns) {
      const checkResult = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = $1`,
        [column.name]
      );

      if (checkResult.rows.length === 0) {
        console.log(`Adding column: ${column.name}...`);
        await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS "${column.name}" ${column.type}`);
      } else {
        console.log(`Column ${column.name} already exists, skipping...`);
      }
    }

    // Create indexes
    for (const index of indexes) {
      console.log(`Creating index: ${index.name}...`);
      await client.query(`CREATE INDEX IF NOT EXISTS ${index.name} ON clients (${index.columns.join(', ')})`);
    }

    await client.query('COMMIT');
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

    console.log(`\n✅ Verified ${result.rows.length} new columns in clients table:`);
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
