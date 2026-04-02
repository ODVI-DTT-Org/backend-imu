const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/imu_db',
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('Checking database schema for location/municipality tables...\n');

    // Check if tables exist
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%location%' OR table_name LIKE '%municipalit%')
      ORDER BY table_name
    `);

    console.log('Tables related to locations/municipalities:');
    tables.rows.forEach(row => console.log('  -', row.table_name));

    // Check user_locations table structure
    const userLocExists = tables.rows.find(r => r.table_name === 'user_locations');
    if (userLocExists) {
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_locations'
        ORDER BY ordinal_position
      ``);
      console.log('\nuser_locations columns:');
      columns.rows.forEach(col => console.log('  -', col.column_name, col.data_type, col.is_nullable));

      const count = await client.query('SELECT COUNT(*) FROM user_locations WHERE deleted_at IS NULL');
      console.log('  Active records:', count.rows[0].count);
    }

    // Check user_municipalities_simple table structure
    const userMunExists = tables.rows.find(r => r.table_name === 'user_municipalities_simple');
    if (userMunExists) {
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_municipalities_simple'
        ORDER BY ordinal_position
      ``);
      console.log('\nuser_municipalities_simple columns:');
      columns.rows.forEach(col => console.log('  -', col.column_name, col.data_type, col.is_nullable));

      const count = await client.query('SELECT COUNT(*) FROM user_municipalities_simple WHERE deleted_at IS NULL');
      console.log('  Active records:', count.rows[0].count);
    }

    // Check caravans table
    const caravansExists = tables.rows.find(r => r.table_name === 'caravans');
    if (caravansExists) {
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'caravans'
        ORDER BY ordinal_position
      ``);
      console.log('\ncaravans columns:');
      columns.rows.forEach(col => console.log('  -', col.column_name, col.data_type, col.is_nullable));
    }

  } finally {
    client.release();
    pool.end();
  }
})();
