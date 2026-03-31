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

async function find2TpClients() {
  const result = await pool.query(`
    SELECT c.id, c.first_name, c.last_name,
      COUNT(DISTINCT t.touchpoint_number) as tp_count,
      array_agg(DISTINCT t.touchpoint_number ORDER BY t.touchpoint_number) as touchpoints,
      array_agg(t.type ORDER BY t.touchpoint_number) as types
    FROM clients c
    INNER JOIN touchpoints t ON c.id = t.client_id
    GROUP BY c.id
    HAVING COUNT(DISTINCT t.touchpoint_number) = 2
    ORDER BY c.created_at DESC
    LIMIT 10
  `);

  console.log('=== Clients with 2 Touchpoints ===\n');

  result.rows.forEach(row => {
    const touchpoints = row.touchpoints.join(', ');
    const types = row.types.join(', ');
    console.log(`${row.first_name} ${row.last_name}:`);
    console.log(`  Touchpoint numbers: [${touchpoints}]`);
    console.log(`  Touchpoint types: [${types}]`);
    console.log(`  Total: ${row.tp_count}/7`);

    // Check if this should be callable
    const newSequence = ['Call', 'Call', 'Visit', 'Call', 'Call', 'Visit', 'Completed'];
    const existingNumbers = row.touchpoints;
    let nextCallNumber = null;

    // Golden rule for Tele users
    if (!existingNumbers.includes(1)) {
      nextCallNumber = 1;
    } else if (existingNumbers.includes(1) && !existingNumbers.includes(2)) {
      nextCallNumber = 2;
    } else if (existingNumbers.includes(3) && !existingNumbers.includes(4)) {
      nextCallNumber = 4;
    } else if (existingNumbers.includes(4) && !existingNumbers.includes(5)) {
      nextCallNumber = 5;
    }

    const nextTp = row.tp_count + 1;
    const expectedType = newSequence[nextTp - 1];
    const shouldBeCallable = nextCallNumber !== null;

    console.log(`  Next: TP${nextTp} (${expectedType})`);
    console.log(`  Should be callable: ${shouldBeCallable ? 'YES' : 'NO'}`);
    console.log(`  Calculated nextCallNumber: TP${nextCallNumber || 'N/A'}`);
    console.log('');
  });

  await pool.end();
}

find2TpClients().catch(console.error);
