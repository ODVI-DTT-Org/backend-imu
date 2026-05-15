/**
 * Geocode Clients Script
 *
 * Geocodes all clients with geocode_status = 'pending' in batches of 50.
 * Runs until no pending clients remain, then exits.
 *
 * Usage (reads DATABASE_URL and MAPBOX_ACCESS_TOKEN from .env by default):
 *   pnpm exec tsx src/scripts/geocode-clients.ts
 *
 * To target a specific database, override DATABASE_URL inline:
 *   DATABASE_URL=<prod-url>  MAPBOX_ACCESS_TOKEN=<token> pnpm exec tsx src/scripts/geocode-clients.ts
 *   DATABASE_URL=<qa4-url>   MAPBOX_ACCESS_TOKEN=<token> pnpm exec tsx src/scripts/geocode-clients.ts
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
  if (!process.env.MAPBOX_ACCESS_TOKEN) {
    console.error('❌ MAPBOX_ACCESS_TOKEN is not set');
    process.exit(1);
  }

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
