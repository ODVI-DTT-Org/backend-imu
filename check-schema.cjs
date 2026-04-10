const { Client } = require('pg');

async function checkSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@host:port/database',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to QA2 database');

    // Check visits table columns
    console.log('\n=== VISITS TABLE COLUMNS ===');
    const visitsColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'visits'
      ORDER BY ordinal_position
    `);
    visitsColumns.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type} (${col.is_nullable})`);
    });

    // Check calls table columns
    console.log('\n=== CALLS TABLE COLUMNS ===');
    const callsColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'calls'
      ORDER BY ordinal_position
    `);
    callsColumns.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type} (${col.is_nullable})`);
    });

    // Check releases table columns
    console.log('\n=== RELEASES TABLE COLUMNS ===');
    const releasesColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'releases'
      ORDER BY ordinal_position
    `);
    releasesColumns.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type} (${col.is_nullable})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

checkSchema().catch(console.error);
