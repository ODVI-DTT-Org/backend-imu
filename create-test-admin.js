import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
const cleanConnectionString = connectionString.split('?')[0];

const client = new Client({
  connectionString: cleanConnectionString,
  ssl: {
    rejectUnauthorized: false,
    checkServerIdentity: () => {}
  }
});

async function createTestAdminUser() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check if test admin user exists
    const checkResult = await client.query(`
      SELECT id, email, role FROM users WHERE email = 'test-admin-pcnicms@imu.test'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✅ Test admin user already exists');
      console.log('   Email:', checkResult.rows[0].email);
      console.log('   Role:', checkResult.rows[0].role);
      await client.end();
      return;
    }

    // Create admin user
    const timestamp = Date.now();
    const email = `test-admin-pcnicms@imu.test`;
    const password = 'TestPass123!';

    // Insert user with admin role
    const insertResult = await client.query(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, email, role
    `, [
      `admin-test-${timestamp}`,
      email,
      '$2b$10$abcdefghijklmnopqrstuvwxyz123456', // Placeholder hash
      'Test',
      'Admin',
      'admin',
      true,
      true
    ]);

    console.log('✅ Admin user created successfully');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('   Role:', insertResult.rows[0].role);
    console.log('\n⚠️  NOTE: Password hash is placeholder. You may need to set a real password.');

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestAdminUser();
