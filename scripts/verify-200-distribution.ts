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

async function verifyDistribution() {
  const result = await pool.query(`
    SELECT COUNT(DISTINCT c.id) as total_clients
    FROM clients c
  `);

  const totalClients = parseInt(result.rows[0].total_clients);
  console.log(`Total clients in database: ${totalClients}\n`);

  // Get distribution by touchpoint count
  const distributionResult = await pool.query(`
    SELECT
      COUNT(DISTINCT t.touchpoint_number) as tp_count,
      COUNT(DISTINCT c.id) as client_count,
      array_agg(DISTINCT t.touchpoint_number ORDER BY t.touchpoint_number) as example_tps
    FROM clients c
    LEFT JOIN touchpoints t ON c.id = t.client_id
    GROUP BY c.id
    ORDER BY tp_count
  `);

  const distribution: { [key: number]: number } = {};
  distributionResult.rows.forEach(row => {
    const count = row.tp_count;
    distribution[count] = (distribution[count] || 0) + 1;
  });

  console.log('=== Distribution by Touchpoint Count ===\n');
  console.log('| Touchpoints | Clients | Percentage |');
  console.log('|-------------|---------|------------|');

  for (let i = 0; i <= 7; i++) {
    const count = distribution[i] || 0;
    const percentage = ((count / totalClients) * 100).toFixed(1);
    console.log(`| ${i.toString().padStart(11)} | ${count.toString().padStart(7)} | ${percentage.padStart(9)}% |`);
  }

  console.log('|-------------|---------|------------|');
  console.log(`| ${'TOTAL'.padStart(11)} | ${totalClients.toString().padStart(7)} | 100.0% |`);

  // Test golden rule across all clients
  console.log('\n=== Golden Rule Analysis ===\n');

  const clientsWithTP = await pool.query(`
    SELECT c.id, c.first_name, c.last_name,
      COUNT(DISTINCT t.touchpoint_number) as tp_count,
      array_agg(DISTINCT t.touchpoint_number ORDER BY t.touchpoint_number) as touchpoints
    FROM clients c
    INNER JOIN touchpoints t ON c.id = t.client_id
    GROUP BY c.id
    ORDER BY tp_count
  `);

  let callableCount = 0;
  let notCallableCount = 0;

  for (const row of clientsWithTP.rows) {
    const existingNumbers = (row.touchpoints || []).sort((a, b) => a - b);
    let toCall = false;

    if (existingNumbers.includes(1) && !existingNumbers.includes(2)) toCall = true;
    else if (existingNumbers.includes(2) && !existingNumbers.includes(3)) toCall = true;
    else if (existingNumbers.includes(4) && !existingNumbers.includes(5)) toCall = true;
    else if (existingNumbers.includes(5) && !existingNumbers.includes(6)) toCall = true;

    if (toCall) callableCount++;
    else notCallableCount++;
  }

  const clientsWithZeroTP = totalClients - clientsWithTP.rows.length;
  const totalCallable = callableCount;
  const totalNotCallable = notCallableCount + clientsWithZeroTP;

  console.log(`Clients with 0 TPs: ${clientsWithZeroTP} (NOT CALLABLE)`);
  console.log(`Clients with TPs - Callable: ${callableCount}`);
  console.log(`Clients with TPs - Not Callable: ${notCallableCount}`);
  console.log('');
  console.log(`Total CALLABLE: ${totalCallable} (${((totalCallable / totalClients) * 100).toFixed(1)}%)`);
  console.log(`Total NOT CALLABLE: ${totalNotCallable} (${((totalNotCallable / totalClients) * 100).toFixed(1)}%)`);

  await pool.end();
}

verifyDistribution().catch(console.error);
