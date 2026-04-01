const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING PRODUCTION DATABASE ===');
    console.log('Database:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0]);

    // Check if clients table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'clients'
      )
    `);
    console.log('Clients table exists:', tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      // Count clients
      const countResult = await client.query('SELECT COUNT(*) as count FROM clients');
      console.log('Total clients:', countResult.rows[0].count);

      // Check clients with caravan_id
      const assignedResult = await client.query('SELECT COUNT(*) as count FROM clients WHERE caravan_id IS NOT NULL');
      console.log('Clients with caravan_id:', assignedResult.rows[0].count);

      // Show sample clients
      const clients = await client.query('SELECT id, first_name, last_name, caravan_id FROM clients LIMIT 3');
      console.log('\nSample clients:');
      clients.rows.forEach(c => {
        console.log('  -', c.first_name, c.last_name, 'caravan_id:', c.caravan_id);
      });
    }

    // Check if user_municipalities_simple exists
    console.log('\n=== CHECKING USER_MUNICIPALITIES_SIMPLE ===');
    const munCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_municipalities_simple'
      )
    `);
    console.log('user_municipalities_simple exists:', munCheck.rows[0].exists);

    if (munCheck.rows[0].exists) {
      const munCount = await client.query('SELECT COUNT(*) as count FROM user_municipalities_simple WHERE deleted_at IS NULL');
      console.log('Active municipality assignments:', munCount.rows[0].count);
    }

    // Check users
    console.log('\n=== CHECKING USERS ===');
    const userCount = await client.query('SELECT COUNT(*) as count FROM users WHERE role IN (\'field_agent\', \'caravan\')');
    console.log('Field agents/caravans:', userCount.rows[0].count);

  } finally {
    client.release();
    pool.end();
  }
})();
