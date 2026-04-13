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

async function checkUsers() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Get all users with their roles
    const result = await client.query(`
      SELECT id, email, first_name, last_name, role, is_active, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('📋 Existing Users:');
    console.table(result.rows);

    // Check if there's an admin user
    const adminResult = await client.query(`
      SELECT id, email, role FROM users WHERE role = 'admin' LIMIT 5
    `);

    if (adminResult.rows.length > 0) {
      console.log('\n✅ Admin users found:');
      console.table(adminResult.rows);
      console.log('\n💡 Use one of these emails to login:');
      adminResult.rows.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.email}`);
      });
    } else {
      console.log('\n⚠️  No admin users found in database');
    }

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUsers();
