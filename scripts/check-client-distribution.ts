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
 * Check distribution of clients by touchpoint count
 */

async function checkDistribution() {
  console.log('=== Client Distribution by Touchpoint Count ===\n');

  const TOUCHPOINT_SEQUENCE = ['Visit', 'Call', 'Call', 'Visit', 'Call', 'Call', 'Visit'] as const;

  const result = await pool.query(`
    SELECT
      tp_count,
      COUNT(*) as client_count,
      next_tp,
      next_type
    FROM (
      SELECT
        c.id,
        COUNT(t.touchpoint_number)::int as tp_count,
        CASE
          WHEN COUNT(t.touchpoint_number)::int >= 7 THEN NULL
          ELSE COUNT(t.touchpoint_number)::int + 1
        END as next_tp,
        CASE
          WHEN COUNT(t.touchpoint_number)::int >= 7 THEN NULL
          ELSE (CASE
            WHEN COUNT(t.touchpoint_number)::int + 1 = 1 THEN 'Visit'
            WHEN COUNT(t.touchpoint_number)::int + 1 = 2 THEN 'Call'
            WHEN COUNT(t.touchpoint_number)::int + 1 = 3 THEN 'Call'
            WHEN COUNT(t.touchpoint_number)::int + 1 = 4 THEN 'Visit'
            WHEN COUNT(t.touchpoint_number)::int + 1 = 5 THEN 'Call'
            WHEN COUNT(t.touchpoint_number)::int + 1 = 6 THEN 'Call'
            WHEN COUNT(t.touchpoint_number)::int + 1 = 7 THEN 'Visit'
          END)
        END as next_type
      FROM clients c
      LEFT JOIN touchpoints t ON c.id = t.client_id
      GROUP BY c.id
    ) subq
    GROUP BY tp_count, next_tp, next_type
    ORDER BY tp_count;
  `);

  console.log('| Count | Clients | Next TP | Next Type | Action Required |');
  console.log('|-------|---------|---------|-----------|----------------|');

  for (const row of result.rows) {
    const { tp_count, client_count, next_tp, next_type } = row;
    const actionRequired = next_type === 'Call'
      ? 'Tele can call ✅'
      : next_type === 'Visit'
        ? 'Caravan can visit ✅'
        : 'Complete ✅';

    console.log(`| ${tp_count}/7   | ${client_count.toString().padStart(7)} | TP${next_tp || 'N/A'} | ${next_type || 'N/A'} | ${actionRequired} |`);
  }

  console.log('\n=== Summary ===');
  console.log('Touchpoint Sequence:', TOUCHPOINT_SEQUENCE.join(' → ') + ' → Completed');
  console.log('');
  console.log('Caravan users: TP1, TP4, TP7 (Visit)');
  console.log('Tele users: TP2, TP3, TP5, TP6 (Call)');
  console.log('');

  await pool.end();
}

checkDistribution().catch(console.error);
