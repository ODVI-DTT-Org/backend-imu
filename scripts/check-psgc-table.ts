/**
 * Check PSGC table structure and sample data
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
    : false,
});

async function checkPsgcTable() {
  try {
    // Get table structure
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'psgc'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 PSGC Table Structure:');
    console.log('='.repeat(60));
    console.table(columnsResult.rows);

    // Get row count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM psgc');
    console.log(`\n📊 Total rows: ${countResult.rows[0].count}`);

    // Get sample data
    const sampleResult = await pool.query('SELECT * FROM psgc LIMIT 10');
    console.log('\n📝 Sample Data:');
    console.log('='.repeat(60));
    console.table(sampleResult.rows);

    // Check for unique level types if exists
    const levelCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'psgc' AND column_name ILIKE '%level%'
    `);

    if (levelCheck.rows.length > 0) {
      const levelsResult = await pool.query(`
        SELECT DISTINCT level, COUNT(*) as count
        FROM psgc
        GROUP BY level
        ORDER BY level
      `);
      console.log('\n📊 Records by Level:');
      console.table(levelsResult.rows);
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkPsgcTable();
