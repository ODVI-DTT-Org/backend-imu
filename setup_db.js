const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
  let client;
  try {
    // Check if users table exists
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'users'
      )
    `);


    if (!result.rows[0].exists) {
      console.log('Creating users table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          first_name TEXT,
          last_name TEXT,
          role TEXT DEFAULT 'field_agent',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('Users table created');
    }

    // Create test user
    const hashedPassword = await bcrypt.hash('test123456', 10);
    await client.query(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, role)
      VALUES (gen_random_uuid(), 'test@example.com', $1, 'Test', 'User', 'field_agent')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('Test user created!');
    console.log('Email: test@example.com');
    console.log('Password: test123456');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();
