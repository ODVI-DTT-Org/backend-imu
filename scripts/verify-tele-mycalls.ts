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

async function verifyTeleMyCallsData() {
  const result = await pool.query(`
    SELECT c.first_name, c.last_name, COUNT(DISTINCT t.touchpoint_number) as tp_count,
      array_agg(DISTINCT t.touchpoint_number ORDER BY t.touchpoint_number) as touchpoints
    FROM clients c
    LEFT JOIN touchpoints t ON c.id = t.client_id
    WHERE c.id IN (
      SELECT id FROM clients ORDER BY created_at DESC LIMIT 20
    )
    GROUP BY c.id, c.first_name, c.last_name
    ORDER BY MIN(c.created_at) DESC
    LIMIT 20
  `);

  console.log('Clients with touchpoints (most recent first):');
  console.log('');

  result.rows.forEach((row, i) => {
    const touchpoints = row.touchpoints || [];
    const progress = `${row.tp_count}/7`;
    const touchpointList = touchpoints.length > 0 ? touchpoints.join(', ') : 'none';
    console.log(`${i + 1}. ${row.first_name} ${row.last_name}: ${progress} TPs [${touchpointList}]`);
  });

  // Test the golden rule logic
  console.log('\n=== Testing Golden Rule Logic ===\n');

  for (const row of result.rows) {
    const existingNumbers = (row.touchpoints || []).sort((a, b) => a - b);
    let nextCallNumber = null;
    let toCall = false;

    // Golden rule: Tele users can only create Call touchpoints (2, 3, 5, 6)
    // Each requires the preceding touchpoint to be completed
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

    const status = toCall ? '✅ CALLABLE' : '❌ NOT CALLABLE';
    const next = nextCallNumber ? `TP${nextCallNumber}` : 'N/A';
    const touchpointList = existingNumbers.length > 0 ? existingNumbers.join(', ') : 'none';
    console.log(`${row.first_name} ${row.last_name}: [${touchpointList}] → ${status} (Next: ${next})`);
  }

  await pool.end();
}

verifyTeleMyCallsData().catch(console.error);
