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
 * Test analytics funnel query
 */

async function testAnalyticsFunnel() {
  console.log('=== Testing Analytics Funnel Query ===\n');

  // Test the funnel query
  const funnelResult = await pool.query(
    `SELECT
      t.touchpoint_number,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE t.status IN ('Interested', 'Undecided', 'Completed')) as converted
     FROM touchpoints t
     LEFT JOIN clients c ON c.id = t.client_id
     GROUP BY t.touchpoint_number
     ORDER BY t.touchpoint_number`
  );

  console.log('Funnel Query Results:');
  console.log('| TP# | Total | Converted | Rate |');
  console.log('|-----|-------|-----------|------|');

  const funnel: Record<string, { total: number; converted: number; rate: number }> = {};
  for (let i = 1; i <= 7; i++) {
    funnel[`touchpoint${i}`] = { total: 0, converted: 0, rate: 0 };
  }

  for (const row of funnelResult.rows) {
    const tpNumber = row.touchpoint_number;
    const tpTotal = parseInt(row.total) || 0;
    const tpConverted = parseInt(row.converted) || 0;
    const rate = tpTotal > 0 ? Math.round((tpConverted / tpTotal) * 100) : 0;
    const key = `touchpoint${tpNumber}`;

    console.log(`| ${tpNumber}   | ${tpTotal} | ${tpConverted} | ${rate}% |`);

    if (funnel[key]) {
      funnel[key] = { total: tpTotal, converted: tpConverted, rate };
    }
  }

  console.log('\n=== Funnel Object ===');
  console.log(JSON.stringify(funnel, null, 2));

  await pool.end();
}

testAnalyticsFunnel().catch(console.error);
