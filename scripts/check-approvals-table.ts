import { pool } from '../src/db/index.js';
import 'dotenv/config';

async function checkApprovalsTable() {
  const client = await pool.connect();

  try {
    console.log('Checking approvals table...\n');

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'approvals'
      )
    `);
    console.log('Table exists:', tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      // Get columns
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'approvals'
        ORDER BY ordinal_position
      `);

      console.log('\nColumns:');
      columns.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkApprovalsTable();
