const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== FIXING user_profiles user_id VALUES ===\n');

    // Get all users with their roles
    const users = await client.query(`
      SELECT id, email, first_name, last_name, role
      FROM users
      ORDER BY created_at DESC
    `);

    console.log(`Found ${users.rows.length} users in users table\n`);

    // Update or insert user_profiles for each user
    for (const user of users.rows) {
      const { id: userId, email, first_name, last_name, role } = user;

      // Check if user_profile exists for this user
      const existingProfile = await client.query(`
        SELECT id FROM user_profiles WHERE user_id = $1
      `, [userId]);

      if (existingProfile.rows.length === 0) {
        // Insert new user_profile
        await client.query(`
          INSERT INTO user_profiles (id, user_id, name, email, role, avatar_url, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, NULL, NOW(), NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            updated_at = NOW()
        `, [userId, `${first_name} ${last_name}`.trim(), email, role]);

        console.log(`✓ Created user_profile for: ${email} (user_id: ${userId})`);
      } else {
        // Update existing user_profile
        await client.query(`
          UPDATE user_profiles
          SET name = $1, email = $2, role = $3, updated_at = NOW()
          WHERE user_id = $4
        `, [`${first_name} ${last_name}`.trim(), email, role, userId]);

        console.log(`✓ Updated user_profile for: ${email} (user_id: ${userId})`);
      }
    }

    // Verify the fix
    const verifyCount = await client.query(`
      SELECT COUNT(*) as count FROM user_profiles
      WHERE user_id IN (SELECT id FROM users)
    `);

    const orphanedCount = await client.query(`
      SELECT COUNT(*) as count FROM user_profiles
      WHERE user_id NOT IN (SELECT id FROM users)
    `);

    console.log(`\n=== VERIFICATION ===`);
    console.log(`✓ user_profiles with matching users: ${verifyCount.rows[0].count}`);
    console.log(`⚠ user_profiles without matching users: ${orphanedCount.rows[0].count}`);

    if (orphanedCount.rows[0].count > 0) {
      console.log(`\nDeleting orphaned user_profiles...`);
      await client.query(`
        DELETE FROM user_profiles
        WHERE user_id NOT IN (SELECT id FROM users)
      `);
      console.log(`✓ Deleted ${orphanedCount.rows[0].count} orphaned user_profiles`);
    }

  } finally {
    client.release();
    pool.end();
  }
})();
