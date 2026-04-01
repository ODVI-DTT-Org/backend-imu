import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log('=== CHECKING CLIENTS TABLE SCHEMA ===\n');

    // Get clients table schema
    const schema = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'clients'
      ORDER BY ordinal_position
    `);

    console.log('clients table columns:');
    schema.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    // Get a sample client record to see actual data
    console.log('\n=== SAMPLE CLIENT RECORD ===');
    const sample = await client.query('SELECT * FROM clients LIMIT 1');

    if (sample.rows.length > 0) {
      const columns = Object.keys(sample.rows[0]);
      console.log('Columns in sample record:', columns);
      console.log('\nSample data:');
      console.log(JSON.stringify(sample.rows[0], null, 2));
    } else {
      console.log('No clients found in database');
    }

  } finally {
    client.release();
    pool.end();
  }
})();
