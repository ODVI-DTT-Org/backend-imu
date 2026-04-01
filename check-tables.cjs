const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== ALL TABLES IN DATABASE ===');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log('Tables found:', tables.rows.length);
    tables.rows.forEach(r => console.log('  -', r.table_name));

    console.log('\n=== CHECKING CARAVAN-RELATED TABLES ===');
    const caravanTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%caravan%' OR table_name LIKE '%user%')
      ORDER BY table_name
    `);
    caravanTables.rows.forEach(r => console.log('  -', r.table_name));

    console.log('\n=== CHECKING USER_MUNICIPALITIES ===');
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

    console.log('\n=== USERS WITH ROLE ===');
    const users = await client.query('SELECT id, email, role, first_name, last_name FROM users WHERE role IN (\'field_agent\', \'caravan\') LIMIT 5');
    console.log('Field agents/caravans:', users.rows.length);
    users.rows.forEach(u => {
      console.log('  -', u.email, 'role:', u.role, 'id:', u.id);
    });

  } finally {
    client.release();
    pool.end();
  }
})();
