import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : undefined,
});

async function checkProblematicClients() {
  // Check clients that are marked as callable but shouldn't be
  const result = await pool.query(`
    SELECT c.id, c.first_name, c.last_name,
      COUNT(DISTINCT t.touchpoint_number) as tp_count,
      array_agg(DISTINCT t.touchpoint_number ORDER BY t.touchpoint_number) as touchpoints,
      array_agg(t.type ORDER BY t.touchpoint_number) as types
    FROM clients c
    INNER JOIN touchpoints t ON c.id = t.client_id
    WHERE c.first_name IN ('Andres', 'Andres')
      AND c.last_name IN ('Lopez', 'Ramos')
    GROUP BY c.id
  `);

  console.log('=== Problematic Clients Analysis ===\n');

  result.rows.forEach(row => {
    const touchpoints = row.touchpoints.join(', ');
    const types = row.types.join(', ');
    console.log(`${row.first_name} ${row.last_name}:`);
    console.log(`  Touchpoint numbers: [${touchpoints}]`);
    console.log(`  Touchpoint types: [${types}]`);
    console.log(`  Total: ${row.tp_count}/7`);
    console.log('');
  });

  // Also check what touchpoints exist in the database
  const touchpointTypesResult = await pool.query(`
    SELECT t.touchpoint_number, t.type, COUNT(*) as count
    FROM touchpoints t
    GROUP BY t.touchpoint_number, t.type
    ORDER BY t.touchpoint_number
  `);

  console.log('=== Current Touchpoint Distribution ===\n');
  console.log('TP# | Type     | Count');
  console.log('----|----------|-------');
  touchpointTypesResult.rows.forEach(row => {
    console.log(`TP${row.touchpoint_number} | ${row.type.padEnd(8)} | ${row.count}`);
  });

  await pool.end();
}

checkProblematicClients().catch(console.error);
