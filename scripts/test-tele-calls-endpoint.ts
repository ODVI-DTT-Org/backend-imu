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

async function testTeleCallsEndpoint() {
  // Simulate the endpoint logic
  const page = 1;
  const perPage = 50;
  const tab = 'all'; // or 'assigned'

  const offset = (page - 1) * perPage;
  const TELE_TOUCHPOINT_NUMBERS = [2, 3, 5, 6];

  // Get clients with touchpoint info (same SQL as endpoint)
  const result = await pool.query(
    `SELECT c.*,
      COALESCE(tp.completed_count, 0) as completed_touchpoints,
      tp.existing_touchpoint_numbers
     FROM clients c
     LEFT JOIN (
       SELECT t.client_id,
         COUNT(DISTINCT t.touchpoint_number)::int as completed_count,
         array_agg(t.touchpoint_number) as existing_touchpoint_numbers
       FROM touchpoints t
       GROUP BY t.client_id
     ) tp ON tp.client_id = c.id
     ORDER BY c.created_at DESC
     LIMIT $1 OFFSET $2`,
    [perPage, offset]
  );

  console.log('=== Endpoint Response Simulation (first 50 clients by created_at DESC) ===\n');

  const clientsWithCallInfo = result.rows.map((row) => {
    const completedCount = parseInt(row.completed_touchpoints) || 0;
    const existingNumbers = (row.existing_touchpoint_numbers || []).sort((a: number, b: number) => a - b);
    const loanReleased = row.loan_released || false;
    const isComplete = completedCount >= 7 || loanReleased;

    let nextCallNumber: number | null = null;

    if (!isComplete) {
      if (existingNumbers.includes(1) && !existingNumbers.includes(2)) {
        nextCallNumber = 2;
      } else if (existingNumbers.includes(2) && !existingNumbers.includes(3)) {
        nextCallNumber = 3;
      } else if (existingNumbers.includes(4) && !existingNumbers.includes(5)) {
        nextCallNumber = 5;
      } else if (existingNumbers.includes(5) && !existingNumbers.includes(6)) {
        nextCallNumber = 6;
      }
    }

    return {
      first_name: row.first_name,
      last_name: row.last_name,
      completed_touchpoints: completedCount,
      existing_touchpoint_numbers: existingNumbers,
      to_call: nextCallNumber !== null,
      next_touchpoint_number: nextCallNumber,
      is_complete: isComplete
    };
  });

  // Filter based on tab
  let filteredClients = clientsWithCallInfo;
  if (tab === 'assigned') {
    filteredClients = clientsWithCallInfo.filter(c => c.to_call);
  }

  // Sort: to_call:true first, then by completed_touchpoints descending
  filteredClients.sort((a, b) => {
    if (a.to_call && !b.to_call) return -1;
    if (!a.to_call && b.to_call) return 1;
    return b.completed_touchpoints - a.completed_touchpoints;
  });

  // Display results
  console.log(`Tab: ${tab}`);
  console.log(`Total clients: ${clientsWithCallInfo.length}`);
  console.log(`Filtered (to_call=true): ${filteredClients.filter(c => c.to_call).length}`);
  console.log('');

  let i = 1;
  for (const client of filteredClients) {
    const touchpoints = client.existing_touchpoint_numbers.length > 0
      ? client.existing_touchpoint_numbers.join(', ')
      : 'none';
    const toCall = client.to_call ? '✅ CALLABLE' : '❌ NOT CALLABLE';
    const next = client.next_touchpoint_number ? `TP${client.next_touchpoint_number}` : 'N/A';
    const complete = client.is_complete ? ' ✅ COMPLETE' : '';

    console.log(`${i}. ${client.first_name} ${client.last_name}`);
    console.log(`   TPs: [${touchpoints}] | Progress: ${client.completed_touchpoints}/7`);
    console.log(`   ${toCall} | Next: ${next}${complete}`);
    console.log('');
    i++;

    if (i > 20) break; // Show first 20
  }

  // Show summary
  const callableCount = filteredClients.filter(c => c.to_call).length;
  const notCallableCount = filteredClients.length - callableCount;
  const completeCount = filteredClients.filter(c => c.is_complete).length;

  console.log('=== Summary ===');
  console.log(`Total: ${filteredClients.length}`);
  console.log(`Callable (to_call=true): ${callableCount}`);
  console.log(`Not Callable: ${notCallableCount}`);
  console.log(`Complete (7/7): ${completeCount}`);

  await pool.end();
}

testTeleCallsEndpoint().catch(console.error);
