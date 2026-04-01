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
    console.log('Connecting to database...');
    client = await pool.connect();
    console.log('Connected!');

    // Check if users table exists
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'users'
      )
    `);

    console.log('Table exists check result:', result.rows[0].exists);

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
    console.log('Creating test user...');
    const hashedPassword = await bcrypt.hash('test123456', 10);

    // First check if user exists
    const userCheck = await client.query('SELECT id FROM users WHERE email = $1', ['test@example.com']);

    if (userCheck.rows.length === 0) {
      await client.query(
        'INSERT INTO users (id, email, password_hash, first_name, last_name, role) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)',
        ['test@example.com', hashedPassword, 'Test', 'User', 'field_agent']
      );
      console.log('Test user created!');
      console.log('Email: test@example.com');
      console.log('Password: test123456');
    } else {
      console.log('Test user already exists');
    }

    client.release();
    await pool.end();
    console.log('Setup complete!');
  } catch (error) {
    console.error('Error:', error.message);
    if (client) client.release();
    await pool.end();
    process.exit(1);
  }
}

setupDatabase();
