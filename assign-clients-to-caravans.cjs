const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== ASSIGNING CLIENTS TO CARAVAN USERS ===\n');

    // Get all caravan role users who have no clients
    const caravanUsers = await client.query(`
      SELECT id, email, first_name, last_name
      FROM users
      WHERE role = 'caravan'
      AND id NOT IN (SELECT DISTINCT caravan_id FROM clients WHERE caravan_id IS NOT NULL)
      ORDER BY email
    `);

    console.log(`Found ${caravanUsers.rows.length} caravan users with no clients\n`);

    // Get unassigned clients (clients with no caravan_id)
    const unassignedClients = await client.query(`
      SELECT id FROM clients WHERE caravan_id IS NULL LIMIT 100
    `);

    console.log(`Found ${unassignedClients.rows.length} unassigned clients\n`);

    if (unassignedClients.rows.length === 0) {
      console.log('No unassigned clients. Reassigning clients from field_agent to caravan users...\n');

      // Reassign some clients from field_agent to caravan users
      let clientIndex = 0;
      for (const caravanUser of caravanUsers.rows) {
        // Get 3-5 clients from field_agent users to reassign
        const clientsToReassign = await client.query(`
          SELECT id FROM clients
          WHERE caravan_id IN (
            SELECT id FROM users WHERE role = 'field_agent'
          )
          LIMIT 5
        `);

        if (clientsToReassign.rows.length > 0) {
          const clientIds = clientsToReassign.rows.map(row => row.id);

          await client.query(`
            UPDATE clients
            SET caravan_id = $1
            WHERE id = ANY($2::uuid[])
          `, [caravanUser.id, clientIds]);

          console.log(`✓ Assigned ${clientIds.length} clients to ${caravanUser.email}`);
        }

        clientIndex++;
        if (clientIndex >= caravanUsers.rows.length) break;
      }
    } else {
      // Assign unassigned clients to caravan users
      let clientIndex = 0;
      const clientsPerUser = Math.ceil(unassignedClients.rows.length / caravanUsers.rows.length);

      for (const caravanUser of caravanUsers.rows) {
        const startIdx = clientIndex * clientsPerUser;
        const endIdx = Math.min(startIdx + clientsPerUser, unassignedClients.rows.length);
        const clientsToAssign = unassignedClients.rows.slice(startIdx, endIdx);

        if (clientsToAssign.length > 0) {
          const clientIds = clientsToAssign.map(row => row.id);

          await client.query(`
            UPDATE clients
            SET caravan_id = $1
            WHERE id = ANY($2::uuid[])
          `, [caravanUser.id, clientIds]);

          console.log(`✓ Assigned ${clientIds.length} clients to ${caravanUser.email}`);
        }

        clientIndex++;
        if (endIdx >= unassignedClients.rows.length) break;
      }
    }

    // Verify the assignment
    console.log('\n=== VERIFICATION ===');
    const caravanWithClients = await client.query(`
      SELECT u.email, u.role, COUNT(c.id) as client_count
      FROM users u
      LEFT JOIN clients c ON c.caravan_id = u.id
      WHERE u.role IN ('caravan', 'field_agent')
      GROUP BY u.id, u.email, u.role
      ORDER BY u.role, u.email
    `);

    caravanWithClients.rows.forEach(row => {
      if (row.client_count > 0) {
        console.log(`✓ ${row.email} (${row.role}): ${row.client_count} clients`);
      } else {
        console.log(`❌ ${row.email} (${row.role}): 0 clients`);
      }
    });

  } finally {
    client.release();
    pool.end();
  }
})();
