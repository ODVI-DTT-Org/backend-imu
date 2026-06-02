/**
 * retag-psgc-geocode.ts
 *
 * Re-geocodes all clients using full_address (street-level) where available,
 * falling back to barangay/municipality/province.
 *
 * Pipeline:
 *   1. Mapbox Geocoding (primary) — fast, 95k/month free cap
 *   2. Nominatim OSM  (fallback)  — free, 1 req/sec
 *
 * Resume-safe: already-tagged clients (in tagged_psgc_clients) are skipped.
 * Commits every --chunk rows so a restart only replays the last chunk.
 *
 * Usage:
 *   DATABASE_URL=<url> MAPBOX_ACCESS_TOKEN=<token> \
 *     pnpm exec tsx src/scripts/retag-psgc-geocode.ts [flags]
 *
 * Flags:
 *   --dry-run      No DB writes
 *   --limit=N      Stop after N clients
 *   --cap=N        Monthly Mapbox cap (default 95000)
 *   --chunk=N      Rows per commit batch (default 500)
 */

import 'dotenv/config';
import { Pool, PoolClient } from 'pg';
import { createWriteStream } from 'fs';

// ── Config ───────────────────────────────────────────────────────────────────

const DATABASE_URL  = process.env.DATABASE_URL;
const MAPBOX_TOKEN  = process.env.MAPBOX_ACCESS_TOKEN ?? '';

if (!DATABASE_URL) { console.error('❌  DATABASE_URL required'); process.exit(1); }

const arg = (name: string) => {
  const a = process.argv.find(v => v.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : null;
};
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const DRY_RUN   = hasFlag('dry-run');
const LIMIT     = arg('limit')  ? parseInt(arg('limit')!)  : Infinity;
const MAPBOX_CAP  = arg('cap')  ? parseInt(arg('cap')!)    : 95_000;
const CHUNK_SIZE  = arg('chunk')? parseInt(arg('chunk')!)  : 500;
const FETCH_SIZE  = 100;        // rows per SELECT
const MAPBOX_RPS  = 10;         // requests/sec for Mapbox
const MIN_SCORE   = 0.5;        // Mapbox relevance threshold

// ── DB ────────────────────────────────────────────────────────────────────────

let dbUrl = DATABASE_URL!;
if (!dbUrl.includes('sslmode'))      dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'sslmode=require';

const pool = new Pool({ connectionString: dbUrl, max: 5 });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Logging ───────────────────────────────────────────────────────────────────

const logFile = createWriteStream('/tmp/geocode-run.log', { flags: 'a' });
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logFile.write(line + '\n');
}

// ── Address builder ───────────────────────────────────────────────────────────

function cleanAddress(raw: string): string {
  return raw
    .replace(/,?\s*REGION\s+[IVXLCDM0-9]+[^,]*/gi, '')
    .replace(/,?\s*NATIONAL CAPITAL REGION[^,]*/gi, '')
    .replace(/(,\s*){2,}/g, ', ')
    .replace(/^[\s,\-]+|[\s,\-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildAddress(row: any): string {
  if (row.full_address?.trim()) {
    const c = cleanAddress(row.full_address);
    if (c) return c.toLowerCase().includes('philippines') ? c : `${c}, Philippines`;
  }
  const parts = [row.barangay, row.municipality, row.province, 'Philippines']
    .filter(Boolean).map((s: string) => s.trim());
  return parts.join(', ');
}

// ── Geocoding APIs ────────────────────────────────────────────────────────────

async function geocodeMapbox(addr: string): Promise<{ lat: number; lng: number; score: number } | null> {
  if (!MAPBOX_TOKEN) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json` +
    `?access_token=${MAPBOX_TOKEN}&country=PH&limit=1&types=address,place,locality,neighborhood`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json() as any;
    const f = d.features?.[0];
    if (!f) return null;
    return { lng: f.center[0], lat: f.center[1], score: f.relevance ?? 0 };
  } catch { return null; }
}

async function geocodeNominatim(addr: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=ph`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'IMU-Field-App-Geocoder/1.0 (contact@cfbtools.app)' },
    });
    if (!r.ok) return null;
    const d = await r.json() as any[];
    if (!d.length) return null;
    return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
  } catch { return null; }
}

async function mapboxUsedThisMonth(): Promise<number> {
  const r = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM tagged_psgc_clients
     WHERE geocode_source='mapbox'
       AND DATE_TRUNC('month',tagged_at)=DATE_TRUNC('month',NOW())`
  );
  return parseInt(r.rows[0].cnt);
}

// ── Chunk commit ──────────────────────────────────────────────────────────────

interface GeoResult {
  clientId: string;
  oldLat: number | null;
  oldLng: number | null;
  newLat: number | null;
  newLng: number | null;
  source: string;
  confidence: number | null;
  address: string;
}

async function commitChunk(results: GeoResult[]): Promise<void> {
  if (!results.length) return;
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of results) {
      await client.query(`
        INSERT INTO tagged_psgc_clients
          (client_id,old_latitude,old_longitude,new_latitude,new_longitude,
           geocode_source,confidence,address_used)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (client_id) DO NOTHING`,
        [r.clientId, r.oldLat, r.oldLng, r.newLat, r.newLng, r.source, r.confidence, r.address]
      );
      if (r.newLat !== null && r.newLng !== null) {
        await client.query(
          'UPDATE clients SET latitude=$1,longitude=$2 WHERE id=$3',
          [r.newLat, r.newLng, r.clientId]
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`🌍  IMU PSGC Re-geocoder starting`);
  log(`   mode=${DRY_RUN?'DRY-RUN':'LIVE'} cap=${MAPBOX_CAP} chunk=${CHUNK_SIZE} limit=${LIMIT===Infinity?'all':LIMIT}`);

  if (!DRY_RUN) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tagged_psgc_clients (
        client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
        old_latitude DOUBLE PRECISION, old_longitude DOUBLE PRECISION,
        new_latitude DOUBLE PRECISION, new_longitude DOUBLE PRECISION,
        geocode_source VARCHAR(20) NOT NULL,
        confidence FLOAT, address_used TEXT,
        tagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tagged_psgc_source ON tagged_psgc_clients(geocode_source)`);
  }

  const { rows: [{ cnt }] } = await pool.query<{cnt:string}>(`
    SELECT COUNT(*) AS cnt FROM clients c
    WHERE deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM tagged_psgc_clients t WHERE t.client_id=c.id)
      AND ((full_address IS NOT NULL AND full_address!='')
           OR barangay IS NOT NULL OR municipality IS NOT NULL OR province IS NOT NULL)`);

  const total = parseInt(cnt);
  const toProcess = LIMIT === Infinity ? total : Math.min(total, LIMIT);
  log(`📊  Pending: ${total.toLocaleString()} | Will process: ${toProcess.toLocaleString()}`);
  if (total === 0) { log('✅  Nothing to do.'); await pool.end(); return; }

  let mapboxUsed = MAPBOX_TOKEN ? await mapboxUsedThisMonth() : MAPBOX_CAP;
  log(`   Mapbox used this month: ${mapboxUsed.toLocaleString()} / ${MAPBOX_CAP.toLocaleString()}`);

  let processed = 0, nMapbox = 0, nNominatim = 0, nFailed = 0;
  const startedAt = Date.now();
  let chunk: GeoResult[] = [];

  const flushChunk = async () => {
    if (!DRY_RUN && chunk.length) await commitChunk(chunk);
    chunk = [];
  };

  while (processed < toProcess) {
    // Always fetch from top — NOT EXISTS excludes already-done rows
    const { rows } = await pool.query(`
      SELECT c.id, c.latitude, c.longitude,
             c.full_address, c.barangay, c.municipality, c.province
      FROM clients c
      WHERE c.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM tagged_psgc_clients t WHERE t.client_id=c.id)
        AND ((c.full_address IS NOT NULL AND c.full_address!='')
             OR c.barangay IS NOT NULL OR c.municipality IS NOT NULL OR c.province IS NOT NULL)
      ORDER BY c.id
      LIMIT $1`, [FETCH_SIZE]);

    if (!rows.length) break;

    for (const row of rows) {
      if (processed >= toProcess) break;

      const address = buildAddress(row);
      const emptyAddr = !address.replace(/,\s*/g,'').replace(/philippines/i,'').trim();

      let newLat: number | null = null;
      let newLng: number | null = null;
      let source = 'failed';
      let confidence: number | null = null;

      if (!emptyAddr) {
        // ── Mapbox ──
        if (MAPBOX_TOKEN && mapboxUsed < MAPBOX_CAP) {
          const r = await geocodeMapbox(address);
          mapboxUsed++;
          if (r && r.score >= MIN_SCORE) {
            newLat = r.lat; newLng = r.lng;
            source = 'mapbox'; confidence = r.score;
            nMapbox++;
          }
          await sleep(Math.ceil(1000 / MAPBOX_RPS));
        }

        // ── Nominatim fallback ──
        if (source === 'failed') {
          const r = await geocodeNominatim(address);
          if (r) {
            newLat = r.lat; newLng = r.lng;
            source = 'nominatim';
            nNominatim++;
          }
          await sleep(1000); // OSM ToS: 1 req/sec
        }
      }

      if (source === 'failed') nFailed++;

      chunk.push({
        clientId: row.id,
        oldLat: row.latitude ?? null, oldLng: row.longitude ?? null,
        newLat, newLng, source, confidence, address,
      });

      processed++;

      // Commit chunk
      if (chunk.length >= CHUNK_SIZE) {
        await flushChunk();
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = processed / elapsed;
        const eta = Math.ceil((toProcess - processed) / rate);
        log(`[${processed.toLocaleString()}/${toProcess.toLocaleString()}] mapbox=${nMapbox} nominatim=${nNominatim} failed=${nFailed} rate=${rate.toFixed(1)}/s ETA=${Math.floor(eta/60)}m${eta%60}s`);
      }
    }

    if (rows.length < FETCH_SIZE) break;
  }

  // Final flush
  await flushChunk();

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  log(`\n✅  Done in ${Math.floor(elapsed/60)}m${elapsed%60}s`);
  log(`   Mapbox:    ${nMapbox.toLocaleString()}`);
  log(`   Nominatim: ${nNominatim.toLocaleString()}`);
  log(`   Failed:    ${nFailed.toLocaleString()}`);
  log(`   Total:     ${processed.toLocaleString()}`);
  if (DRY_RUN) log('   ⚠️  DRY RUN — nothing written.');

  logFile.end();
  await pool.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
