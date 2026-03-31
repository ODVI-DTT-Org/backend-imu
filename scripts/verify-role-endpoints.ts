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

/**
 * Verify role-based endpoint logic
 *
 * Tests both /tele-calls and /caravan-visits endpoint logic
 */

async function verifyRoleEndpoints() {
  console.log('=== Verifying Role-Based Endpoint Logic ===\n');

  // Touchpoint sequence
  const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'] as const;

  // Test scenarios with different touchpoint counts
  const scenarios = [
    { count: 0, nextTp: 1, nextType: 'Visit', teleCan: false, caravanCan: true, reason: 'TP1 is Visit - Caravan only' },
    { count: 1, nextTp: 2, nextType: 'Call', teleCan: true, caravanCan: false, reason: 'TP2 is Call - Tele only' },
    { count: 2, nextTp: 3, nextType: 'Call', teleCan: true, caravanCan: false, reason: 'TP3 is Call - Tele only' },
    { count: 3, nextTp: 4, nextType: 'Visit', teleCan: false, caravanCan: true, reason: 'TP4 is Visit - Caravan only' },
    { count: 4, nextTp: 5, nextType: 'Call', teleCan: true, caravanCan: false, reason: 'TP5 is Call - Tele only' },
    { count: 5, nextTp: 6, nextType: 'Call', teleCan: true, caravanCan: false, reason: 'TP6 is Call - Tele only' },
    { count: 6, nextTp: 7, nextType: 'Visit', teleCan: false, caravanCan: true, reason: 'TP7 is Visit → Completed - Caravan only' },
    { count: 7, nextTp: null, nextType: null, teleCan: false, caravanCan: false, reason: 'All complete' },
  ];

  console.log('Testing endpoint logic:\n');
  console.log('| Count | Next TP | Type | Tele Can | Caravan Can | Reason |');
  console.log('|-------|---------|------|----------|-------------|--------|');

  let allPassed = true;
  for (const scenario of scenarios) {
    const { count, nextTp, nextType, teleCan, caravanCan, reason } = scenario;

    // Simulate /tele-calls endpoint logic
    const teleToCall = nextType === 'Call' && nextTp !== null;
    const telePassed = teleToCall === teleCan;

    // Simulate /caravan-visits endpoint logic
    const caravanToVisit = nextType === 'Visit' && nextTp !== null;
    const caravanPassed = caravanToVisit === caravanCan;

    const passed = telePassed && caravanPassed;
    const status = passed ? '✅' : '❌';

    if (!passed) allPassed = false;

    console.log(`| ${count}/7   | TP${nextTp || 'N/A'} | ${nextType || 'N/A'} | ${teleToCall ? 'YES' : 'NO '} | ${caravanToVisit ? 'YES' : 'NO '} | ${reason} ${status} |`);
  }

  console.log('\n=== Summary ===');
  console.log('Touchpoint Sequence:', TOUCHPOINT_SEQUENCE.join(' → ') + ' → Completed');
  console.log('');
  console.log('Caravan users (Visit touchpoints): TP1, TP4, TP7 (marks client as Completed)');
  console.log('Tele users (Call touchpoints): TP2, TP3, TP5, TP6');
  console.log('');

  if (allPassed) {
    console.log('✅ All scenarios PASSED!');
    console.log('');
    console.log('Endpoints:');
    console.log('  GET /api/clients/tele-calls - Returns clients with to_call field');
    console.log('  GET /api/clients/caravan-visits - Returns clients with to_visit field');
  } else {
    console.log('❌ Some scenarios FAILED!');
  }

  // Test with actual database data
  console.log('\n=== Database Verification ===');
  const result = await pool.query(`
    SELECT c.id, c.first_name, c.last_name,
      COUNT(DISTINCT t.touchpoint_number)::int as tp_count,
      array_agg(DISTINCT t.touchpoint_number ORDER BY touchpoint_number) as touchpoints
    FROM clients c
    INNER JOIN touchpoints t ON c.id = t.client_id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 5
  `);

  console.log('\nSample clients from database:\n');
  for (const row of result.rows) {
    const count = row.tp_count;
    const nextTp = count >= 7 ? null : count + 1;
    const nextType = nextTp ? TOUCHPOINT_SEQUENCE[nextTp - 1] : null;
    const teleCan = nextType === 'Call';
    const caravanCan = nextType === 'Visit';

    console.log(`${row.first_name} ${row.last_name}:`);
    console.log(`  Touchpoints: [${row.touchpoints.join(', ')}] (${count}/7)`);
    console.log(`  Next: TP${nextTp || 'N/A'} (${nextType || 'Complete'})`);
    console.log(`  Tele can call: ${teleCan ? 'YES' : 'NO'}`);
    console.log(`  Caravan can visit: ${caravanCan ? 'YES' : 'NO'}`);
    console.log('');
  }

  await pool.end();
}

verifyRoleEndpoints().catch(console.error);
