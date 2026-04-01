import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkAndUpdateTeleUsers() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check for tele users
    const teleUsersResult = await client.query(
      `SELECT id, email, role FROM users WHERE role = 'tele'`
    );

    console.log('Tele users found:', teleUsersResult.rows.length);
    teleUsersResult.rows.forEach(u => {
      console.log(`  - ${u.email} (${u.id})`);
    });

    if (teleUsersResult.rows.length === 0) {
      console.log('\nNo tele users found. Creating one...');

      // Create a tele user
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash('password123', 10);

      const newUserResult = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, role`,
        ['teleuser@example.com', hashedPassword, 'Tele', 'User', 'tele']
      );

      console.log('Created tele user:', newUserResult.rows[0]);

      // Update Call touchpoints with null user_id to use the new tele user
      const updateResult = await client.query(
        `UPDATE touchpoints
         SET user_id = $1
         WHERE type = 'Call' AND user_id IS NULL`,
        [newUserResult.rows[0].id]
      );

      console.log(`Updated ${updateResult.rowCount} Call touchpoints with tele user`);
    } else {
      // Update Call touchpoints with null user_id to use the first tele user
      const teleUserId = teleUsersResult.rows[0].id;
      const updateResult = await client.query(
        `UPDATE touchpoints
         SET user_id = $1
         WHERE type = 'Call' AND user_id IS NULL`,
        [teleUserId]
      );

      console.log(`\nUpdated ${updateResult.rowCount} Call touchpoints with tele user ${teleUsersResult.rows[0].email}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('Error:', error);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

checkAndUpdateTeleUsers();
