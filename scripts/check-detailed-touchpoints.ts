/**
 * Detailed touchpoint analysis
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

async function checkDetailedTouchpoints() {
  try {
    const result = await pool.query(`
      SELECT
        c.first_name,
        c.last_name,
        t.touchpoint_number,
        t.type
      FROM clients c
      LEFT JOIN touchpoints t ON c.id = t.client_id
      ORDER BY c.first_name, c.last_name, t.touchpoint_number
    `);

    // Group by client
    const clients: Map<string, any[]> = new Map();
    for (const row of result.rows) {
      const key = `${row.first_name} ${row.last_name}`;
      if (!clients.has(key)) {
        clients.set(key, []);
      }
      if (row.touchpoint_number) {
        clients.get(key)!.push({
          number: row.touchpoint_number,
          type: row.type
        });
      }
    }

    console.log('Detailed touchpoint breakdown:\n');
    for (const [clientName, touchpoints] of clients.entries()) {
      console.log(`${clientName}:`);
      if (touchpoints.length === 0) {
        console.log('  No touchpoints');
      } else {
        const sorted = touchpoints.sort((a, b) => a.number - b.number);
        sorted.forEach(tp => {
          console.log(`  TP${tp.number} (${tp.type})`);
        });
        console.log(`  Total: ${touchpoints.length} touchpoints`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkDetailedTouchpoints();
