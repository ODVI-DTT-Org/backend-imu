/**
 * Run Full-Text Search Migration
 *
 * Execute SQL migration file using the application's database connection
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create database pool
let databaseUrl = process.env.DATABASE_URL;

// Add uselibpqcompat=true for DigitalOcean to handle SSL properly
if (databaseUrl?.includes('ondigitalocean.com') && !databaseUrl.includes('uselibpqcompat=')) {
  databaseUrl += '&uselibpqcompat=true';
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false,
});

async function runMigration() {
  const migrationPath = join(__dirname, '../migrations/048_add_full_text_search_index.sql');
  console.log(`Running migration: ${migrationPath}`);

  try {
    const sql = readFileSync(migrationPath, 'utf-8');
    console.log('SQL content loaded, executing...');

    await pool.query(sql);
    console.log('✅ Full-text search indexes created successfully');
    console.log('');
    console.log('Indexes created:');
    console.log('- idx_clients_full_text_search');
    console.log('- idx_clients_first_name_full_text');
    console.log('- idx_clients_last_name_full_text');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('Migration complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration error:', error);
    process.exit(1);
  });
