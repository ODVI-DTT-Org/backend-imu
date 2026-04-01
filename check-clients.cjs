const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING CLIENTS TABLE ===');

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

      // Show sample clients
      const clients = await client.query('SELECT id, first_name, last_name, caravan_id, created_at FROM clients LIMIT 5');
      console.log('\nSample clients:');
      clients.rows.forEach(c => {
        console.log('  -', c.id, c.first_name, c.last_name, 'caravan_id:', c.caravan_id);
      });
    }

    // Check other tables
    console.log('\n=== CHECKING OTHER TABLES ===');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'caravans', 'user_municipalities_simple')
      ORDER BY table_name
    `);
    console.log('Tables:', tables.rows.map(r => r.table_name).join(', '));

    // Count users
    const userCount = await client.query('SELECT COUNT(*) as count FROM users');
    console.log('Total users:', userCount.rows[0].count);

  } finally {
    client.release();
    pool.end();
  }
})();
