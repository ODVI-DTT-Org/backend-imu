/**
 * Geocode Clients Script
 *
 * Geocodes all clients with geocode_status = 'pending' in batches of 50.
 * Uses the 3-step pipeline: PSGC pin_location → Haiku AI matching → Mapbox.
 * Runs until no pending clients remain, then exits.
 *
 * Required env vars:
 *   DATABASE_URL           — Postgres connection string
 *
 * Optional (each step only activates when its key is present):
 *   ANTHROPIC_API_KEY      — enables Claude Haiku PSGC matching (step 2)
 *   MAPBOX_ACCESS_TOKEN    — enables Mapbox forward geocoding fallback (step 3)
 *
 * Usage:
 *   # default .env
 *   pnpm exec tsx src/scripts/geocode-clients.ts
 *
 *   # production DB
 *   DATABASE_URL=<prod-url> ANTHROPIC_API_KEY=<key> MAPBOX_ACCESS_TOKEN=<token> \
 *     pnpm exec tsx src/scripts/geocode-clients.ts
 *
 *   # qa4 DB
 *   DATABASE_URL=<qa4-url> ANTHROPIC_API_KEY=<key> MAPBOX_ACCESS_TOKEN=<token> \
 *     pnpm exec tsx src/scripts/geocode-clients.ts
 */

import 'dotenv/config';
import { pool } from '../db/index.js';
import { GeocodeClientsProcessor } from '../queues/processors/geocode-clients-processor.js';
import { GeocodingJobType } from '../queues/jobs/job-types.js';

// Minimal Job stub — only the two methods BaseProcessor.updateProgress() calls
const scriptJob = {
  id: 'geocode-script',
  data: { type: GeocodingJobType.GEOCODE_CLIENTS, userId: 'script' },
  updateProgress: async () => {},
  log: async () => {},
} as any;

async function main() {
  const hasHaiku = !!process.env.ANTHROPIC_API_KEY;
  const hasMapbox = !!process.env.MAPBOX_ACCESS_TOKEN;

  console.log(
    `🔧 Pipeline: PSGC lookup (always)` +
    ` → Haiku AI matching (${hasHaiku ? 'enabled' : 'disabled — set ANTHROPIC_API_KEY'})` +
    ` → Mapbox fallback (${hasMapbox ? 'enabled' : 'disabled — set MAPBOX_ACCESS_TOKEN'})`
  );

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM clients WHERE geocode_status = 'pending' AND deleted_at IS NULL`
  );
  const total = parseInt(rows[0].count, 10);

  if (total === 0) {
    console.log('✅ No pending clients to geocode.');
    return;
  }

  console.log(`📍 ${total} client(s) pending geocoding — processing in batches of 50…`);

  const processor = new GeocodeClientsProcessor();
  let batchNum = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;

  while (true) {
    const result = await processor.process(scriptJob);
    if (result.total === 0) break;

    batchNum++;
    totalSucceeded += result.succeeded.length;
    totalFailed += result.failed.length;

    console.log(
      `  Batch ${batchNum}: ${result.succeeded.length} succeeded, ${result.failed.length} failed` +
        (result.failed.length > 0
          ? ` (${result.failed.map((f) => f.id).join(', ')})`
          : '')
    );
  }

  console.log(`\n✅ Done. Total: ${totalSucceeded} succeeded, ${totalFailed} failed across ${batchNum} batch(es).`);
}

main()
  .catch((err) => {
    console.error('❌ Script error:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
