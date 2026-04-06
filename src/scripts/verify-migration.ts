import 'dotenv/config';
import { pool } from '../db/index.js';

async function verifyMigration() {
  try {
    const result = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'deleted_at'"
    );
    console.log('✅ deleted_at column exists:', result.rows.length > 0);
    console.log('Row count:', result.rows.length);
  } catch (error: any) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    await pool.end();
  }
}

verifyMigration();
