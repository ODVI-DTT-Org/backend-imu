/**
 * retag-psgc-geocode.ts
 *
 * Re-geocodes all clients from PSGC barangay centroids to street-level
 * coordinates using a two-API pipeline:
 *
 *   1. Mapbox Geocoding API (primary)  — fast, 100k free/month
 *      Used until MAPBOX_MONTHLY_CAP requests are made this calendar month.
 *      Default cap: 95,000 (leaves 5k headroom in the 100k free tier).
 *
 *   2. Nominatim / OpenStreetMap (fallback / overflow)
 *      Used when Mapbox is over monthly cap or returns low confidence.
 *      Rate-limited to 1 req/sec as required by OSM ToS.
 *
 * Resume-safe: clients already in tagged_psgc_clients are skipped.
 * Run this script multiple months in a row — it stops automatically when done.
 *
 * Usage:
 *   DATABASE_URL=<prod> MAPBOX_ACCESS_TOKEN=<token> \
 *     pnpm exec tsx src/scripts/retag-psgc-geocode.ts
 *
 * Flags:
 *   --dry-run          Print what would happen without writing to DB
 *   --limit=N          Process at most N clients (default: all)
 *   --cap=N            Override monthly Mapbox cap (default: 95000)
 *   --batch=N          Batch size per DB read (default: 100)
 */

import 'dotenv/config';
import { Pool } from 'pg';

// ── Config ──────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN ?? '';

if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL env var required');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const DRY_RUN          = args['dry-run'] === true;
const LIMIT            = args['limit']   ? parseInt(args['limit'] as string) : Infinity;
const MAPBOX_CAP       = args['cap']     ? parseInt(args['cap']   as string) : 95_000;
const BATCH_SIZE       = args['batch']   ? parseInt(args['batch'] as string) : 100;
const MAPBOX_MIN_SCORE = 0.5;            // below this, fall back to Nominatim
const MAPBOX_RPS       = 10;             // requests per second

// ── DB pool ──────────────────────────────────────────────────────────────────

let dbUrl = DATABASE_URL;
if (!dbUrl.includes('sslmode')) dbUrl += '?sslmode=require';
if (!dbUrl.includes('uselibpqcompat')) {
  dbUrl += dbUrl.includes('?') ? '&uselibpqcompat=true' : '?uselibpqcompat=true';
}

const pool = new Pool({ connectionString: dbUrl, max: 5 });

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function cleanAddress(raw: string): string {
  return raw
    // Remove "REGION X (REGION NAME)" suffixes
    .replace(/,?\s*REGION\s+[IVXLCDM]+[^,]*/gi, '')
    .replace(/,?\s*NATIONAL CAPITAL REGION[^,]*/gi, '')
    // Remove empty comma-separated segments ", , ,"
    .replace(/(,\s*){2,}/g, ', ')
    // Remove trailing/leading commas and whitespace
    .replace(/^[\s,]+|[\s,]+$/g, '')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildAddress(row: any): string {
  // Prefer full_address (scripted, has real street numbers/names).
  // Fall back to PSGC barangay/municipality/province only when absent.
  if (row.full_address && row.full_address.trim()) {
    const cleaned = cleanAddress(row.full_address);
    if (cleaned) {
      return cleaned.toLowerCase().includes('philippines')
          ? cleaned
          : `${cleaned}, Philippines`;
    }
  }
  const parts = [
    row.barangay,
    row.municipality,
    row.province,
    'Philippines',
  ].filter(Boolean).map((s: string) => s.trim());
  return parts.join(', ');
}

// ── Mapbox geocoding ──────────────────────────────────────────────────────────

async function geocodeMapbox(address: string): Promise<{ lat: number; lng: number; score: number } | null> {
  if (!MAPBOX_TOKEN) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
    `?access_token=${MAPBOX_TOKEN}&country=PH&limit=1&types=address,place,locality,neighborhood`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const feat = data.features?.[0];
    if (!feat) return null;
    return {
      lng: feat.center[0],
      lat: feat.center[1],
      score: feat.relevance ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Nominatim geocoding ───────────────────────────────────────────────────────

async function geocodeNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=ph`;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'IMU-Field-App-Geocoder/1.0 (field agent management; contact@cfbtools.app)' },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any[];
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// ── Monthly Mapbox usage counter ──────────────────────────────────────────────

async function mapboxUsedThisMonth(): Promise<number> {
  const res = await pool.query<{ cnt: string }>(`
    SELECT COUNT(*) AS cnt FROM tagged_psgc_clients
    WHERE geocode_source = 'mapbox'
      AND DATE_TRUNC('month', tagged_at) = DATE_TRUNC('month', NOW())
  `);
  return parseInt(res.rows[0].cnt);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌍  IMU PSGC Re-geocoder`);
  console.log(`   Mode:          ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`   Limit:         ${LIMIT === Infinity ? 'all' : LIMIT}`);
  console.log(`   Mapbox cap:    ${MAPBOX_CAP.toLocaleString()} / month`);
  console.log(`   Batch size:    ${BATCH_SIZE}`);
  if (!MAPBOX_TOKEN) console.log(`   ⚠️  No MAPBOX_ACCESS_TOKEN — Nominatim only (1 req/sec)`);

  // Ensure table exists
  if (!DRY_RUN) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tagged_psgc_clients (
        client_id      UUID        PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
        old_latitude   DOUBLE PRECISION,
        old_longitude  DOUBLE PRECISION,
        new_latitude   DOUBLE PRECISION,
        new_longitude  DOUBLE PRECISION,
        geocode_source VARCHAR(20) NOT NULL,
        confidence     FLOAT,
        address_used   TEXT,
        tagged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  // Count pending
  const pendingRes = await pool.query<{ cnt: string }>(`
    SELECT COUNT(*) AS cnt FROM clients c
    WHERE c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM tagged_psgc_clients t WHERE t.client_id = c.id)
      AND (
        (c.full_address IS NOT NULL AND c.full_address != '')
        OR c.barangay IS NOT NULL OR c.municipality IS NOT NULL OR c.province IS NOT NULL
      )
  `);
  const totalPending = Math.min(parseInt(pendingRes.rows[0].cnt), LIMIT === Infinity ? Infinity : LIMIT);
  console.log(`\n📊  Pending: ${totalPending.toLocaleString()} clients to process\n`);

  if (totalPending === 0) {
    console.log('✅  Nothing to do — all clients already tagged.');
    await pool.end();
    return;
  }

  // Stats
  let processed = 0, successMapbox = 0, successNominatim = 0, failed = 0;
  const startedAt = Date.now();

  // Mapbox monthly usage
  let mapboxUsed = MAPBOX_TOKEN ? await mapboxUsedThisMonth() : MAPBOX_CAP;
  console.log(`   Mapbox used this month: ${mapboxUsed.toLocaleString()} / ${MAPBOX_CAP.toLocaleString()}\n`);

  let offset = 0;

  while (processed < (LIMIT === Infinity ? Infinity : LIMIT)) {
    // Fetch next batch
    const batch = await pool.query(`
      SELECT c.id, c.latitude, c.longitude,
             c.full_address, c.barangay, c.municipality, c.province
      FROM clients c
      WHERE c.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM tagged_psgc_clients t WHERE t.client_id = c.id)
        AND (
          (c.full_address IS NOT NULL AND c.full_address != '')
          OR c.barangay IS NOT NULL OR c.municipality IS NOT NULL OR c.province IS NOT NULL
        )
      ORDER BY c.id
      LIMIT $1 OFFSET $2
    `, [BATCH_SIZE, offset]);

    if (!batch.rows.length) break;

    for (const row of batch.rows) {
      if (processed >= (LIMIT === Infinity ? Infinity : LIMIT)) break;

      const address = buildAddress(row);
      if (!address.replace(/,\s*/g, '').replace(/philippines/i, '').trim()) {
        // No usable address parts
        if (!DRY_RUN) {
          await pool.query(`
            INSERT INTO tagged_psgc_clients
              (client_id, old_latitude, old_longitude, geocode_source, address_used)
            VALUES ($1, $2, $3, 'failed', $4)
            ON CONFLICT (client_id) DO NOTHING
          `, [row.id, row.latitude, row.longitude, address]);
        }
        failed++;
        processed++;
        continue;
      }

      let newLat: number | null = null;
      let newLng: number | null = null;
      let source: string = 'failed';
      let confidence: number | null = null;

      // ── Try Mapbox ──
      const useMapbox = MAPBOX_TOKEN && mapboxUsed < MAPBOX_CAP;
      if (useMapbox) {
        const result = await geocodeMapbox(address);
        if (result && result.score >= MAPBOX_MIN_SCORE) {
          newLat = result.lat;
          newLng = result.lng;
          source = 'mapbox';
          confidence = result.score;
          mapboxUsed++;
          successMapbox++;
          // Rate limit
          await sleep(Math.ceil(1000 / MAPBOX_RPS));
        } else {
          // Low confidence or no result — fall through to Nominatim
          mapboxUsed++; // still counts as a request
        }
      }

      // ── Try Nominatim if Mapbox failed/skipped ──
      if (source === 'failed') {
        const result = await geocodeNominatim(address);
        if (result) {
          newLat = result.lat;
          newLng = result.lng;
          source = 'nominatim';
          successNominatim++;
        }
        // Nominatim ToS: 1 req/sec
        await sleep(1000);
      }

      if (source === 'failed') failed++;

      // ── Write ──
      if (!DRY_RUN) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`
            INSERT INTO tagged_psgc_clients
              (client_id, old_latitude, old_longitude, new_latitude, new_longitude,
               geocode_source, confidence, address_used)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (client_id) DO NOTHING
          `, [row.id, row.latitude, row.longitude, newLat, newLng, source, confidence, address]);

          if (newLat !== null && newLng !== null) {
            await client.query(
              'UPDATE clients SET latitude = $1, longitude = $2 WHERE id = $3',
              [newLat, newLng, row.id],
            );
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      }

      processed++;

      // Progress every 100
      if (processed % 100 === 0) {
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = processed / elapsed;
        const eta = totalPending !== Infinity
          ? Math.ceil((totalPending - processed) / rate)
          : null;
        console.log(
          `[${processed.toLocaleString()}/${totalPending === Infinity ? '?' : totalPending.toLocaleString()}] ` +
          `mapbox=${successMapbox} nominatim=${successNominatim} failed=${failed} ` +
          `rate=${rate.toFixed(1)}/s` +
          (eta ? ` ETA=${Math.floor(eta / 60)}m${eta % 60}s` : ''),
        );
      }
    }

    offset += BATCH_SIZE;
    if (batch.rows.length < BATCH_SIZE) break; // last batch
  }

  // Final summary
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n✅  Done in ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
  console.log(`   Mapbox:    ${successMapbox.toLocaleString()}`);
  console.log(`   Nominatim: ${successNominatim.toLocaleString()}`);
  console.log(`   Failed:    ${failed.toLocaleString()} (no address or no result)`);
  console.log(`   Total:     ${processed.toLocaleString()}`);
  if (DRY_RUN) console.log(`\n   ⚠️  DRY RUN — nothing was written to the database.`);

  await pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
