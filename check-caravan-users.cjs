const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING CARAVAN USERS AND CLIENT ASSIGNMENTS ===\n');

    // Get all caravan role users
    const caravanUsers = await client.query(`
      SELECT id, email, first_name, last_name, role
      FROM users
      WHERE role IN ('caravan', 'field_agent')
      ORDER BY role, email
    `);

    console.log(`Found ${caravanUsers.rows.length} caravan/field_agent users\n`);

    for (const user of caravanUsers.rows) {
      const { id, email, role } = user;

      // Count clients assigned to this user
      const clientCount = await client.query(`
        SELECT COUNT(*) as count FROM clients WHERE caravan_id = $1
      `, [id]);

      const count = clientCount.rows[0].count;

      if (count > 0) {
        console.log(`✓ ${email} (${role}): ${count} clients`);
      } else {
        console.log(`❌ ${email} (${role}): 0 clients (NO CLIENTS ASSIGNED)`);
      }
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    const caravanWithClients = await client.query(`
      SELECT COUNT(DISTINCT caravan_id) as count FROM clients WHERE caravan_id IS NOT NULL
    `);
    const caravanWithoutClients = await client.query(`
      SELECT COUNT(*) as count FROM users
      WHERE role IN ('caravan', 'field_agent')
      AND id NOT IN (SELECT DISTINCT caravan_id FROM clients WHERE caravan_id IS NOT NULL)
    `);

    console.log(`Caravan/field_agent users with clients: ${caravanWithClients.rows[0].count}`);
    console.log(`Caravan/field_agent users without clients: ${caravanWithoutClients.rows[0].count}`);

  } finally {
    client.release();
    pool.end();
  }
})();
