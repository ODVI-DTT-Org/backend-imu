import { pool } from './src/database/index.js';

async function checkUsers() {
  try {
    const result = await pool.query(`
      SELECT id, email, first_name, last_name, role_slug 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    console.log('Users in database:');
    console.table(result.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error checking users:', error);
    process.exit(1);
  }
}

checkUsers();
