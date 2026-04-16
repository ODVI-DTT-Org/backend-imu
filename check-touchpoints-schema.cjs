const { Client } = require('pg');

async function checkTouchpointsSchema() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const fixedConnectionString = connectionString.replace('sslmode=require', 'sslmode=no-verify');

  const client = new Client({
    connectionString: fixedConnectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Get touchpoints table schema
    console.log('\n📋 Touchpoints table schema:');
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'touchpoints'
      ORDER BY ordinal_position
    `);

    console.log('Column Name            | Data Type          | Nullable?');
    console.log('----------------------|--------------------|----------');
    result.rows.forEach(row => {
      const columnName = (row.column_name || '').padEnd(22);
      const dataType = (row.data_type || '').padEnd(20);
      const nullable = (row.is_nullable || '').padEnd(9);
      console.log(`${columnName} | ${dataType} | ${nullable}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

checkTouchpointsSchema();
