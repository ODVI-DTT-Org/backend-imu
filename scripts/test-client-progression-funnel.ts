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
 * Test client progression funnel query
 */

async function testClientProgressionFunnel() {
  console.log('=== Testing Client Progression Funnel Query ===\n');

  // Test the new funnel query
  const funnelResult = await pool.query(
    `SELECT
        tp_count,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE tp_count >= 7 OR loan_released = true) as completed
       FROM (
         SELECT
           c.id,
           COUNT(t.touchpoint_number)::int as tp_count,
           c.loan_released
          FROM clients c
          LEFT JOIN touchpoints t ON c.id = t.client_id
          GROUP BY c.id, c.loan_released
       ) subq
       GROUP BY tp_count
       ORDER BY tp_count`
  );

  console.log('Client Progression Funnel Results:');
  console.log('| Stage | Total Clients | Completed | Rate |');
  console.log('|-------|--------------|-----------|------|');

  const funnel: Record<string, { total: number; completed: number; rate: number }> = {};
  for (let i = 0; i <= 7; i++) {
    funnel[`stage${i}`] = { total: 0, completed: 0, rate: 0 };
  }

  let totalClients = 0;
  let totalCompleted = 0;

  for (const row of funnelResult.rows) {
    const tpCount = row.tp_count;
    const tpTotal = parseInt(row.total) || 0;
    const tpCompleted = parseInt(row.completed) || 0;
    const stage = Math.min(tpCount, 7);
    const key = `stage${stage}`;
    const rate = tpTotal > 0 ? Math.round((tpCompleted / tpTotal) * 100) : 0;

    console.log(`| ${stage}/7   | ${tpTotal} | ${tpCompleted} | ${rate}% |`);

    if (funnel[key]) {
      funnel[key] = { total: tpTotal, completed: tpCompleted, rate };
    }

    totalClients += tpTotal;
    totalCompleted += tpCompleted;
  }

  console.log('\n=== Summary ===');
  console.log(`Total clients: ${totalClients}`);
  console.log(`Completed (7/7): ${totalCompleted}`);
  console.log(`Overall completion rate: ${totalClients > 0 ? Math.round((totalCompleted / totalClients) * 100) : 0}%`);

  console.log('\n=== Funnel Object ===');
  console.log(JSON.stringify(funnel, null, 2));

  await pool.end();
}

testClientProgressionFunnel().catch(console.error);
