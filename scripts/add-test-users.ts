import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'imu_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
  } : undefined
});

const users = [
  // Area Managers (2)
  { email: 'am1@test.com', firstName: 'Area', lastName: 'Manager One', role: 'area_manager' },
  { email: 'am2@test.com', firstName: 'Area', lastName: 'Manager Two', role: 'area_manager' },
  
  // Assistant Area Managers (4)
  { email: 'aam1@test.com', firstName: 'Asst', lastName: 'Area Manager 1', role: 'assistant_area_manager' },
  { email: 'aam2@test.com', firstName: 'Asst', lastName: 'Area Manager 2', role: 'assistant_area_manager' },
  { email: 'aam3@test.com', firstName: 'Asst', lastName: 'Area Manager 3', role: 'assistant_area_manager' },
  { email: 'aam4@test.com', firstName: 'Asst', lastName: 'Area Manager 4', role: 'assistant_area_manager' },
  
  // Admins (2)
  { email: 'admin1@test.com', firstName: 'Admin', lastName: 'User One', role: 'admin' },
  { email: 'admin2@test.com', firstName: 'Admin', lastName: 'User Two', role: 'admin' },
  
  // Caravans (10)
  { email: 'caravan1@test.com', firstName: 'Caravan', lastName: 'User 1', role: 'caravan' },
  { email: 'caravan2@test.com', firstName: 'Caravan', lastName: 'User 2', role: 'caravan' },
  { email: 'caravan3@test.com', firstName: 'Caravan', lastName: 'User 3', role: 'caravan' },
  { email: 'caravan4@test.com', firstName: 'Caravan', lastName: 'User 4', role: 'caravan' },
  { email: 'caravan5@test.com', firstName: 'Caravan', lastName: 'User 5', role: 'caravan' },
  { email: 'caravan6@test.com', firstName: 'Caravan', lastName: 'User 6', role: 'caravan' },
  { email: 'caravan7@test.com', firstName: 'Caravan', lastName: 'User 7', role: 'caravan' },
  { email: 'caravan8@test.com', firstName: 'Caravan', lastName: 'User 8', role: 'caravan' },
  { email: 'caravan9@test.com', firstName: 'Caravan', lastName: 'User 9', role: 'caravan' },
  { email: 'caravan10@test.com', firstName: 'Caravan', lastName: 'User 10', role: 'caravan' },
];

const password = 'Password123!';

async function addUsers() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    for (const user of users) {
      // Check if user exists
      const existing = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [user.email]
      );
      
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO users (id, email, first_name, last_name, password_hash, role, is_active)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true)`,
          [user.email, user.firstName, user.lastName, hashedPassword, user.role]
        );
        console.log(`✅ Created: ${user.email} (${user.role})`);
      } else {
        // Update existing user
        await client.query(
          `UPDATE users SET first_name = $1, last_name = $2, role = $3, is_active = true WHERE email = $4`,
          [user.firstName, user.lastName, user.role, user.email]
        );
        console.log(`🔄 Updated: ${user.email} (${user.role})`);
      }
    }
    
    // Count users by role
    const counts = await client.query(
      `SELECT role, COUNT(*) as count FROM users WHERE role IN ('admin', 'area_manager', 'assistant_area_manager', 'caravan') GROUP BY role ORDER BY role`
    );
    
    console.log('\n📊 User counts by role:');
    for (const row of counts.rows) {
      console.log(`   ${row.role}: ${row.count}`);
    }
    
    await client.query('COMMIT');
    console.log('\n✅ Users added/updated successfully!');
    console.log(`\n🔑 Default password for all users: ${password}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addUsers().catch(console.error);
