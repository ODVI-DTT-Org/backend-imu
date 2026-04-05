import { pool } from './src/db/index.js';
import { config } from 'dotenv';

config();

async function checkDatabaseColumns() {
  console.log('🔍 Checking database columns...\n');

  // Check clients table
  console.log('--- Clients Table ---');
  const clientColumns = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'clients'
    ORDER BY ordinal_position
  `);
  clientColumns.rows.forEach(row => {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  });

  // Check addresses table
  console.log('\n--- Addresses Table ---');
  const addressColumns = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'addresses'
    ORDER BY ordinal_position
  `);
  addressColumns.rows.forEach(row => {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  });

  // Check touchpoints table
  console.log('\n--- Touchpoints Table ---');
  const touchpointColumns = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'touchpoints'
    ORDER BY ordinal_position
  `);
  touchpointColumns.rows.forEach(row => {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  });

  // Check user_profiles table
  console.log('\n--- User Profiles Table ---');
  const userProfileColumns = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'user_profiles'
    ORDER BY ordinal_position
  `);
  userProfileColumns.rows.forEach(row => {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  });

  // Check touchpoint_reasons table
  console.log('\n--- Touchpoint Reasons Table ---');
  const reasonColumns = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'touchpoint_reasons'
    ORDER BY ordinal_position
  `);
  reasonColumns.rows.forEach(row => {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  });

  // Check psgc table
  console.log('\n--- PSGC Table ---');
  const psgcColumns = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'psgc'
    ORDER BY ordinal_position
  `);
  psgcColumns.rows.forEach(row => {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  });

  await pool.end();
}

checkDatabaseColumns().catch(console.error);
