/**
 * Check which clients are ready for Tele
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

async function checkTeleAvailable() {
  try {
    console.log('Checking which clients are ready for Tele (have TP1, missing TP2):\n');

    const result = await pool.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        COUNT(t.id) as tp_count,
        ARRAY_AGG(t.touchpoint_number ORDER BY t.touchpoint_number) as existing_tps
      FROM clients c
      LEFT JOIN touchpoints t ON c.id = t.client_id
      GROUP BY c.id, c.first_name, c.last_name
      HAVING BOOL_AND(t.touchpoint_number = 1) OR COUNT(t.id) = 0
      ORDER BY c.first_name, c.last_name
    `);

    console.log('Clients with TP1 completed:');
    for (const row of result.rows) {
      const hasTP1 = row.existing_tps.includes(1);
      const hasTP2 = row.existing_tps.includes(2);

      if (hasTP1 && !hasTP2) {
        console.log(`  ✅ ${row.first_name} ${row.last_name} - READY FOR TELE (TP1 done, TP2 available)`);
      } else if (hasTP1 && hasTP2) {
        // Check for TP3
        const hasTP3 = row.existing_tps.includes(3);
        if (hasTP3) {
          // Check for TP4
          const hasTP4 = row.existing_tps.includes(4);
          if (hasTP4) {
            // Check for TP5
            const hasTP5 = row.existing_tps.includes(5);
            if (hasTP5) {
              console.log(`  ⚠️  ${row.first_name} ${row.last_name} - Has TP1-TP5, needs TP4 or TP6`);
            } else {
              console.log(`  ⚠️  ${row.first_name} ${row.last_name} - Has TP1-TP4, needs TP5`);
            }
          } else {
            console.log(`  ⚠️  ${row.first_name} ${row.last_name} - Has TP1-TP3, needs TP4 (Visit)`);
          }
        } else {
          console.log(`  ⚠️  ${row.first_name} ${row.last_name} - Has TP1-TP2, needs TP3`);
        }
      } else {
        console.log(`  ❌ ${row.first_name} ${row.last_name} - No touchpoints, needs TP1 (Visit)`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkTeleAvailable();
