const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== VERIFYING CLIENTS caravan_id ASSIGNMENTS ===\n');

    // Check all caravan_id values in clients table
    const clientCaravans = await client.query(`
      SELECT DISTINCT caravan_id
      FROM clients
      WHERE caravan_id IS NOT NULL
    `);

    console.log(`Found ${clientCaravans.rows.length} distinct caravan_id values in clients table\n`);

    // Check if these caravan_id values exist in users table
    for (const row of clientCaravans.rows) {
      const caravanId = row.caravan_id;

      const userCheck = await client.query(`
        SELECT id, email, role
        FROM users
        WHERE id = $1
      `, [caravanId]);

      if (userCheck.rows.length === 0) {
        console.log(`❌ caravan_id ${caravanId} NOT FOUND in users table (ORPHANED)`);
      } else {
        const user = userCheck.rows[0];
        const clientCount = await client.query(`
          SELECT COUNT(*) as count FROM clients WHERE caravan_id = $1
        `, [caravanId]);

        console.log(`✓ caravan_id ${caravanId} → ${user.email} (${user.role}) → ${clientCount.rows[0].count} clients`);
      }
    }

    // Count clients by role
    console.log('\n=== CLIENTS BY USER ROLE ===');
    const clientsByRole = await client.query(`
      SELECT u.role, COUNT(c.id) as client_count
      FROM clients c
      JOIN users u ON c.caravan_id = u.id
      GROUP BY u.role
      ORDER BY client_count DESC
    `);

    clientsByRole.rows.forEach(row => {
      console.log(`  - ${row.role}: ${row.client_count} clients`);
    });

    // Show which caravan users have the most clients
    console.log('\n=== TOP CARAVAN USERS BY CLIENT COUNT ===');
    const topCaravans = await client.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, COUNT(c.id) as client_count
      FROM users u
      JOIN clients c ON c.caravan_id = u.id
      GROUP BY u.id, u.email, u.first_name, u.last_name
      ORDER BY client_count DESC
      LIMIT 10
    `);

    topCaravans.rows.forEach(row => {
      console.log(`  - ${row.email}: ${row.client_count} clients`);
    });

  } finally {
    client.release();
    pool.end();
  }
})();
