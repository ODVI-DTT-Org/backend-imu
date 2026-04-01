/**
 * Check touchpoint status for remaining clients
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkTouchpoints() {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.client_type,
        COUNT(t.id) as touchpoint_count,
        ARRAY_AGG(t.touchpoint_number ORDER BY t.touchpoint_number) as existing_touchpoints,
        ARRAY_AGG(t.type ORDER BY t.touchpoint_number) as touchpoint_types
      FROM clients c
      LEFT JOIN touchpoints t ON c.id = t.client_id
      GROUP BY c.id, c.first_name, c.last_name, c.client_type
      ORDER BY c.created_at DESC
    `);

    console.log('Client touchpoint status:');
    console.table(result.rows.map(row => ({
      name: `${row.first_name} ${row.last_name}`,
      type: row.client_type,
      count: row.touchpoint_count,
      touchpoints: row.existing_touchpoints || [],
      types: row.touchpoint_types || []
    })));

    // Find clients with TP1 completed (ready for Tele)
    const readyForTele = await pool.query(`
      SELECT DISTINCT c.id, c.first_name, c.last_name
      FROM clients c
      INNER JOIN touchpoints t ON c.id = t.client_id
      WHERE t.touchpoint_number = 1
      AND NOT EXISTS (
        SELECT 1 FROM touchpoints t2
        WHERE t2.client_id = c.id AND t2.touchpoint_number = 2
      )
    `);

    console.log(`\nClients ready for Tele (TP1 done, TP2 available): ${readyForTele.rows.length}`);
    if (readyForTele.rows.length > 0) {
      console.table(readyForTele.rows.map(r => `${r.first_name} ${r.last_name}`));
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkTouchpoints();
