/**
 * Test INSERT to debug column name issues
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

async function testInsert() {
  try {
    // Test with quoted identifiers (case-sensitive)
    const testQuery1 = `
      INSERT INTO clients (
        first_name, last_name, "3g_company"
      ) VALUES ($1, $2, $3)
    `;

    console.log('Testing with quoted identifiers...');
    try {
      await pool.query(testQuery1, ['Test', 'User', 'Test Company']);
      console.log('✅ Quoted identifiers work!');
    } catch (e: any) {
      console.log('❌ Quoted identifiers failed:', e.message);
    }

    // Test with unquoted identifiers (lowercase)
    const testQuery2 = `
      INSERT INTO clients (
        first_name, last_name, 3g_company
      ) VALUES ($1, $2, $3)
    `;

    console.log('\nTesting with unquoted identifiers...');
    try {
      await pool.query(testQuery2, ['Test2', 'User2', 'Test Company 2']);
      console.log('✅ Unquoted identifiers work!');
    } catch (e: any) {
      console.log('❌ Unquoted identifiers failed:', e.message);
    }

    // Get actual column names
    const result = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'clients'
      AND column_name IN ('3g_company', '3g_status', 'DMVAL_code', 'DMVAL_name', 'DMVAL_amount')
      ORDER BY column_name
    `);

    console.log('\nActual column names in database:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}`);
    });

    // Clean up test records
    await pool.query("DELETE FROM clients WHERE first_name IN ('Test', 'Test2')");

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await pool.end();
  }
}

testInsert().catch(console.error);
