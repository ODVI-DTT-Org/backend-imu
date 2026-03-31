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

async function testGoldenRule() {
  // Get clients with touchpoints
  const result = await pool.query(`
    SELECT c.id, c.first_name, c.last_name,
      COUNT(DISTINCT t.touchpoint_number) as tp_count,
      array_agg(DISTINCT t.touchpoint_number ORDER BY t.touchpoint_number) as touchpoints
    FROM clients c
    INNER JOIN touchpoints t ON c.id = t.client_id
    GROUP BY c.id
    ORDER BY tp_count
    LIMIT 30
  `);

  console.log('=== Golden Rule Verification ===\n');

  for (const row of result.rows) {
    const existingNumbers = (row.touchpoints || []).sort((a, b) => a - b);
    let nextCallNumber: number | null = null;
    let toCall = false;

    // Golden rule
    if (existingNumbers.includes(1) && !existingNumbers.includes(2)) {
      nextCallNumber = 2;
      toCall = true;
    } else if (existingNumbers.includes(2) && !existingNumbers.includes(3)) {
      nextCallNumber = 3;
      toCall = true;
    } else if (existingNumbers.includes(4) && !existingNumbers.includes(5)) {
      nextCallNumber = 5;
      toCall = true;
    } else if (existingNumbers.includes(5) && !existingNumbers.includes(6)) {
      nextCallNumber = 6;
      toCall = true;
    }

    const touchpointList = existingNumbers.join(', ');
    const next = nextCallNumber ? `TP${nextCallNumber}` : 'N/A';
    const status = toCall ? '✅ CALLABLE' : '❌ NOT CALLABLE';

    console.log(`${row.first_name} ${row.last_name}:`);
    console.log(`  TPs: [${touchpointList}] | ${status} | Next: ${next}`);
    console.log('');
  }

  await pool.end();
}

testGoldenRule().catch(console.error);
