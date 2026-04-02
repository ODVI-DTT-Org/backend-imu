const { Pool } = require('pg');
const fs = require('fs');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false
});

async function runMigration(migrationFile) {
  let client;
  try {
    client = await pool.connect();
    console.log(`Running migration: ${migrationFile}`);

    const sql = fs.readFileSync(migrationFile, 'utf8');
    await client.query(sql);

    console.log('✅ Migration executed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Get migration file from command line argument
const migrationFile = process.argv[2] || 'src/migrations/038_create_error_logs_table.sql';
runMigration(migrationFile);
