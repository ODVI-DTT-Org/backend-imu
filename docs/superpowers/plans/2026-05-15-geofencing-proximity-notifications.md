# Geofencing Proximity Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alert caravan agents with a local Android notification when they move within 400m of an unvisited client's home, with Navigate Now / Add to Itinerary / Dismiss action buttons and a 16-hour per-client cooldown.

**Architecture:** Phase 1 geocodes client addresses (text → lat/lng) via a backend BullMQ job that looks up standardized names from the `psgc` table then calls Mapbox forward geocoding, storing results in `clients.latitude/longitude`. Phase 2 adds those columns to the PowerSync sync config so they flow to devices. Phase 3 adds a Flutter `GeofencingService` that starts its own Geolocator position stream and, on each 10m movement update, queries the local SQLite DB for clients within a ~550m bounding box, then fires a `flutter_local_notifications` notification with action buttons for any client within 400m whose 16-hour SharedPreferences cooldown has expired.

**Tech Stack:** Node.js/TypeScript + BullMQ (backend jobs), PostgreSQL (DB trigger), Hono (route handlers), Vitest (backend tests), Flutter/Dart + Geolocator + flutter_local_notifications ^17.0.0 + SharedPreferences + PowerSync SQLite (Flutter), flutter_test (Flutter tests)

---

## File Map

**Create:**
- `backend-imu/src/db/migrations/052_add_geocoding_to_clients.sql`
- `backend-imu/src/queues/processors/geocode-clients-processor.ts`
- `backend-imu/src/tests/unit/geocode-clients.test.ts`
- `frontend-mobile-imu/imu_flutter/lib/services/geofencing/geofencing_service.dart`
- `frontend-mobile-imu/imu_flutter/test/unit/services/geofencing_service_test.dart`

**Modify:**
- `backend-imu/src/queues/jobs/job-types.ts` — add `GeocodingJobType` enum, `GeocodingJobData` interface, `GEOCODING` queue name, update `JobType` union
- `backend-imu/src/queues/utils/job-helpers.ts` — add `addGeocodingJob` helper
- `backend-imu/src/queues/index.ts` — export new types and helper
- `backend-imu/src/queues/workers.ts` — register geocoding worker
- `backend-imu/src/routes/clients.ts` — queue geocoding job after POST create
- `backend-imu/powersync/sync-config.yaml` — add `latitude`, `longitude` to both client streams
- `frontend-mobile-imu/imu_flutter/lib/app.dart` — initialize `GeofencingService` in `_IMUAppState.initState()`

---

## Task 1: Database migration — geocoding columns + DB trigger

**Files:**
- Create: `backend-imu/src/db/migrations/052_add_geocoding_to_clients.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration: 052_add_geocoding_to_clients
-- Adds geocoding columns and a trigger that resets geocode_status to 'pending'
-- whenever a client is inserted or their address fields change (covers both
-- REST-path and PowerSync CRUD-queue writes from manager roles).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS latitude        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geocoded_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geocode_status  TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_clients_geocode_status
  ON clients (geocode_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_lat_lng
  ON clients (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND deleted_at IS NULL;

-- Trigger: reset geocode_status to 'pending' on insert or address-field change.
-- The background job polls for geocode_status = 'pending' and handles the rest.
CREATE OR REPLACE FUNCTION fn_geocode_clients_on_change() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR
     (OLD.province IS DISTINCT FROM NEW.province OR
      OLD.municipality IS DISTINCT FROM NEW.municipality OR
      OLD.barangay IS DISTINCT FROM NEW.barangay) THEN
    NEW.geocode_status := 'pending';
    NEW.latitude := NULL;
    NEW.longitude := NULL;
    NEW.geocoded_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_geocode_clients ON clients;
CREATE TRIGGER trg_geocode_clients
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION fn_geocode_clients_on_change();
```

Save to `backend-imu/src/db/migrations/052_add_geocoding_to_clients.sql`.

- [ ] **Step 2: Run the migration**

```bash
cd backend-imu
pnpm exec tsx src/scripts/run-migration.ts src/db/migrations/052_add_geocoding_to_clients.sql
```

Expected output:
```
📜 Running migration: src/db/migrations/052_add_geocoding_to_clients.sql
✅ Migration completed successfully: src/db/migrations/052_add_geocoding_to_clients.sql
```

- [ ] **Step 3: Verify columns exist**

```bash
cd backend-imu
pnpm exec tsx -e "
import 'dotenv/config';
import { pool } from './src/db/index.js';
const r = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='clients' AND column_name IN ('latitude','longitude','geocoded_at','geocode_status') ORDER BY column_name\");
console.log(r.rows.map(x => x.column_name));
pool.end();
"
```

Expected: `[ 'geocode_status', 'geocoded_at', 'latitude', 'longitude' ]`

- [ ] **Step 4: Commit**

```bash
git add backend-imu/src/db/migrations/052_add_geocoding_to_clients.sql
git commit -m "feat: add geocoding columns and reset trigger to clients table"
```

---

## Task 2: Add GeocodingJobType, GeocodingJobData, and GEOCODING queue name

**Files:**
- Modify: `backend-imu/src/queues/jobs/job-types.ts`

- [ ] **Step 1: Add the enum, interface, and queue name**

Open `backend-imu/src/queues/jobs/job-types.ts` and make three edits.

**Edit 1** — add the enum after the closing `}` of `SyncJobType` (around line 79):

```typescript
/**
 * Geocoding Queue Job Types
 * For forward-geocoding client addresses to lat/lng
 */
export enum GeocodingJobType {
  GEOCODE_CLIENTS = 'geocode_clients',
}
```

**Edit 2** — add `GEOCODING` to `QUEUE_NAMES` (around line 89):

```typescript
export const QUEUE_NAMES = {
  BULK_OPERATIONS: 'bulk-operations',
  REPORTS: 'reports',
  LOCATION_ASSIGNMENTS: 'location-assignments',
  SYNC_OPERATIONS: 'sync-operations',
  BULK_UPLOAD: 'bulk-upload',
  GEOCODING: 'geocoding',
} as const;
```

**Edit 3** — update the `JobType` union (around line 84):

```typescript
export type JobType = BulkJobType | ReportJobType | LocationJobType | SyncJobType | GeocodingJobType;
```

**Edit 4** — add the job data interface after `BulkUploadJobResult` (around line 204):

```typescript
/**
 * Geocoding job data interface
 */
export interface GeocodingJobData extends BaseJobData {
  type: GeocodingJobType;
  clientId?: string; // if set, geocode this single client; if absent, batch-process all pending
}
```

- [ ] **Step 2: Run the existing job-types test to confirm no breakage**

```bash
cd backend-imu
pnpm exec vitest run src/queues/jobs/job-types.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend-imu/src/queues/jobs/job-types.ts
git commit -m "feat: add GeocodingJobType enum, GeocodingJobData, and GEOCODING queue name"
```

---

## Task 3: Implement geocode-clients-processor.ts

**Files:**
- Create: `backend-imu/src/queues/processors/geocode-clients-processor.ts`

The processor fetches batches of pending clients (50 at a time), looks up standardized address from the `psgc` table using `psgc_id`, calls Mapbox forward geocoding, and writes back `latitude`, `longitude`, `geocoded_at`, `geocode_status`.

- [ ] **Step 1: Create the processor file**

```typescript
/**
 * Geocode Clients Processor
 *
 * Processes GEOCODE_CLIENTS jobs. On each run:
 *   - If job.data.clientId is set: geocodes that one client.
 *   - Otherwise: fetches up to 50 pending clients from DB and geocodes them.
 *
 * Uses psgc_id to look up standardized address from the psgc table.
 * Falls back to raw province/municipality/barangay fields when psgc_id is null.
 * Calls Mapbox /geocoding/v5/mapbox.places/{query}.json with PH bounding box.
 */

import { Job } from 'bullmq';
import { pool } from '../../db/index.js';
import { BaseProcessor } from '../base-processor.js';
import type { JobResult } from '../jobs/job-types.js';
import type { GeocodingJobData } from '../jobs/job-types.js';
import { createJobResult } from '../utils/job-helpers.js';
import { logger } from '../../utils/logger.js';

const BATCH_SIZE = 50;
const MAPBOX_DELAY_MS = 300; // 600 req/min free tier → 100ms min, use 300ms to be safe
const PH_BBOX = '116.9,4.6,126.6,21.1';
const MIN_CONFIDENCE = 0.5;
const MAPBOX_TIMEOUT_MS = 8000;

interface PendingClient {
  id: string;
  psgc_id: number | null;
  province: string | null;
  municipality: string | null;
  barangay: string | null;
}

interface PsgcAddress {
  region: string | null;
  province: string | null;
  mun_city: string | null;
  brgy: string | null;
}

interface MapboxFeature {
  place_name: string;
  relevance: number;
  center: [number, number]; // [lng, lat]
  bbox?: [number, number, number, number];
}

interface MapboxResponse {
  features: MapboxFeature[];
}

export class GeocodeClientsProcessor extends BaseProcessor<GeocodingJobData, JobResult> {
  constructor() {
    super('geocoding');
  }

  async process(job: Job<GeocodingJobData>): Promise<JobResult> {
    const startedAt = new Date();
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
      throw new Error('MAPBOX_ACCESS_TOKEN is not set');
    }

    const clients = job.data.clientId
      ? await this.fetchSingleClient(job.data.clientId)
      : await this.fetchPendingClients();

    if (clients.length === 0) {
      return createJobResult(0, [], [], startedAt, { operation: 'geocode_clients' });
    }

    logger.info('GeocodeClients', `Job ${job.id} geocoding ${clients.length} client(s)`);

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      try {
        await this.geocodeClient(client, token);
        succeeded.push(client.id);
      } catch (err: any) {
        failed.push({ id: client.id, error: err.message });
        logger.warn('GeocodeClients', `Client ${client.id} geocoding failed: ${err.message}`);
      }

      // Rate-limit: skip delay after last client
      if (i < clients.length - 1) {
        await this.delay(MAPBOX_DELAY_MS);
      }

      await this.updateProgress(job, {
        progress: Math.floor(((i + 1) / clients.length) * 100),
        total: clients.length,
        current: i + 1,
        message: `Geocoded ${i + 1}/${clients.length}`,
        succeeded,
        failed,
      });
    }

    logger.info(
      'GeocodeClients',
      `Job ${job.id} done. succeeded=${succeeded.length} failed=${failed.length}`
    );

    return createJobResult(clients.length, succeeded, failed, startedAt, {
      operation: 'geocode_clients',
    });
  }

  private async fetchPendingClients(): Promise<PendingClient[]> {
    const result = await pool.query<PendingClient>(
      `SELECT id, psgc_id, province, municipality, barangay
       FROM clients
       WHERE geocode_status = 'pending' AND deleted_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1`,
      [BATCH_SIZE]
    );
    return result.rows;
  }

  private async fetchSingleClient(clientId: string): Promise<PendingClient[]> {
    const result = await pool.query<PendingClient>(
      `SELECT id, psgc_id, province, municipality, barangay
       FROM clients
       WHERE id = $1 AND deleted_at IS NULL`,
      [clientId]
    );
    return result.rows;
  }

  private async geocodeClient(client: PendingClient, token: string): Promise<void> {
    // Check for skippable client (no address at all)
    if (!client.province && !client.municipality && !client.barangay && !client.psgc_id) {
      await pool.query(
        `UPDATE clients SET geocode_status = 'skipped' WHERE id = $1`,
        [client.id]
      );
      return;
    }

    const addressString = await this.buildAddressString(client);
    const result = await this.forwardGeocode(addressString, token);

    if (result && this.isWithinPhilippines(result.center[0], result.center[1])) {
      await pool.query(
        `UPDATE clients
         SET latitude = $1, longitude = $2, geocoded_at = NOW(), geocode_status = 'success'
         WHERE id = $3`,
        [result.center[1], result.center[0], client.id]
      );
    } else {
      await pool.query(
        `UPDATE clients SET geocode_status = 'failed' WHERE id = $1`,
        [client.id]
      );
    }
  }

  private async buildAddressString(client: PendingClient): Promise<string> {
    if (client.psgc_id) {
      const psgcResult = await pool.query<PsgcAddress>(
        `SELECT region, province, mun_city, brgy FROM psgc WHERE id = $1`,
        [client.psgc_id]
      );
      if (psgcResult.rows.length > 0) {
        const p = psgcResult.rows[0];
        const parts = [p.brgy, p.mun_city, p.province].filter(Boolean);
        return `${parts.join(', ')}, Philippines`;
      }
    }

    // Fallback to raw fields
    const parts = [client.barangay, client.municipality, client.province].filter(Boolean);
    return `${parts.join(', ')}, Philippines`;
  }

  private async forwardGeocode(
    query: string,
    token: string
  ): Promise<MapboxFeature | null> {
    const encoded = encodeURIComponent(query);
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
      `?access_token=${encodeURIComponent(token)}` +
      `&bbox=${PH_BBOX}` +
      `&country=PH` +
      `&limit=1`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MAPBOX_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        throw new Error(`Mapbox HTTP ${res.status}`);
      }
      const data = (await res.json()) as MapboxResponse;
      const feature = data.features?.[0];
      if (!feature || feature.relevance < MIN_CONFIDENCE) return null;
      return feature;
    } finally {
      clearTimeout(timer);
    }
  }

  private isWithinPhilippines(lng: number, lat: number): boolean {
    return lng >= 116.9 && lng <= 126.6 && lat >= 4.6 && lat <= 21.1;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const geocodeClientsProcessor = new GeocodeClientsProcessor();
```

Save to `backend-imu/src/queues/processors/geocode-clients-processor.ts`.

- [ ] **Step 2: TypeScript compile check**

```bash
cd backend-imu
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend-imu/src/queues/processors/geocode-clients-processor.ts
git commit -m "feat: add GeocodeClientsProcessor for forward geocoding client addresses"
```

---

## Task 4: Register geocoding worker + export new types

**Files:**
- Modify: `backend-imu/src/queues/workers.ts`
- Modify: `backend-imu/src/queues/utils/job-helpers.ts`
- Modify: `backend-imu/src/queues/index.ts`

- [ ] **Step 1: Add worker registration to workers.ts**

Add this import at the top of `backend-imu/src/queues/workers.ts` (after the existing imports):

```typescript
import { geocodeClientsProcessor } from './processors/geocode-clients-processor.js';
```

Add this block inside `startWorkers()` after the bulkUploadProcessor registration block:

```typescript
    // Register geocoding processor
    await geocodeClientsProcessor.start();
    const geocodingWorker = geocodeClientsProcessor.getWorker();
    if (geocodingWorker) {
      queueManager.registerWorker('geocoding', geocodingWorker);
    }
```

- [ ] **Step 2: Add addGeocodingJob helper to job-helpers.ts**

In `backend-imu/src/queues/utils/job-helpers.ts`, add the import for the new types at the top (with the existing imports):

```typescript
import type { GeocodingJobData, GeocodingJobType } from '../jobs/job-types.js';
```

Then add this function after `addSyncJob` (before the `getJob` function):

```typescript
/**
 * Add a geocoding job to the geocoding queue.
 * If clientId is provided, geocodes that single client.
 * If clientId is omitted, the processor fetches all pending clients in a batch.
 */
export async function addGeocodingJob(
  userId: string,
  clientId?: string,
  options?: JobsOptions
) {
  const queueManager = getQueueManager();

  const data: GeocodingJobData = {
    userId,
    type: GeocodingJobType.GEOCODE_CLIENTS,
    clientId,
  };

  return queueManager.addJob('geocoding', GeocodingJobType.GEOCODE_CLIENTS, data, options);
}
```

You'll need to import `GeocodingJobType` at the top of job-helpers.ts — add it to the existing import from `'../jobs/job-types.js'`:

```typescript
import type {
  BulkJobData,
  ReportJobData,
  SyncJobData,
  GeocodingJobData,
  GeocodingJobType as _GeocodingJobType,
  JobResult,
  JobProgress,
  QueueName,
} from '../jobs/job-types.js';
import { GeocodingJobType } from '../jobs/job-types.js';
```

- [ ] **Step 3: Export from queues/index.ts**

Add to the existing export block in `backend-imu/src/queues/index.ts`:

```typescript
// Export geocoding job type
export { GeocodingJobType } from './jobs/job-types.js';
export type { GeocodingJobData } from './jobs/job-types.js';

// Export geocoding job helper
export { addGeocodingJob } from './utils/job-helpers.js';
```

- [ ] **Step 4: TypeScript compile check**

```bash
cd backend-imu
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend-imu/src/queues/workers.ts \
        backend-imu/src/queues/utils/job-helpers.ts \
        backend-imu/src/queues/index.ts
git commit -m "feat: register geocoding worker and export addGeocodingJob helper"
```

---

## Task 5: Queue geocoding after client create and address update (REST path)

**Files:**
- Modify: `backend-imu/src/routes/clients.ts`

- [ ] **Step 1: Add import**

Near the top of `backend-imu/src/routes/clients.ts` where other queue imports live (line ~20):

```typescript
import { addGeocodingJob } from '../queues/index.js';
```

- [ ] **Step 2: Queue after successful POST /api/clients create**

In the `POST /api/clients` handler (around line 1303), after the `await client.query('COMMIT')` for the admin path and before the `return c.json(...)`, add:

```typescript
    // Queue geocoding for newly created client (fire and forget — non-blocking)
    addGeocodingJob(user.sub, result.rows[0].id).catch((err) =>
      logger.warn('GeocodeClients', `Failed to enqueue geocoding for new client: ${err.message}`)
    );
```

The full context around where to insert (after commit, before return):

```typescript
    await client.query('COMMIT');

    // Queue geocoding for newly created client (fire and forget — non-blocking)
    addGeocodingJob(user.sub, result.rows[0].id).catch((err) =>
      logger.warn('GeocodeClients', `Failed to enqueue geocoding for new client: ${err.message}`)
    );

    return c.json(mapRowToClient(result.rows[0]), 201);
```

**Note on address updates:** The DB trigger from Task 1 resets `geocode_status = 'pending'` for ALL writes (REST and PowerSync CRUD queue alike). The `PATCH /api/clients/:id` handler only accepts `loan_released` and `loan_released_at` — never address fields — so no geocoding enqueue is needed there. Address changes come through the PSGC assignment endpoints (lines ~2398 and ~2502 in `clients.ts`), and the DB trigger handles those automatically without any REST-level queue call.

- [ ] **Step 3: TypeScript compile check**

```bash
cd backend-imu
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend-imu/src/routes/clients.ts
git commit -m "feat: queue geocoding job after client create"
```

---

## Task 6: Backend unit tests for geocode-clients-processor

**Files:**
- Create: `backend-imu/src/tests/unit/geocode-clients.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeocodeClientsProcessor } from '../../queues/processors/geocode-clients-processor.js';

// Mock the DB pool
vi.mock('../../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Import pool after mock is set up
import { pool } from '../../db/index.js';

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

// Helper to build a mock Job object
function makeJob(overrides: Partial<{ data: any; id: string }> = {}) {
  return {
    id: 'job-1',
    data: {
      type: 'geocode_clients',
      userId: 'user-1',
    },
    ...overrides,
  } as any;
}

// Successful Mapbox response for a PH coordinate
const MAPBOX_SUCCESS = {
  features: [
    {
      place_name: 'Brgy. Test, Zamboanga City, Philippines',
      relevance: 0.9,
      center: [122.076, 6.912], // [lng, lat] — valid PH coords
    },
  ],
};

// Low-confidence Mapbox response
const MAPBOX_LOW_CONFIDENCE = {
  features: [{ place_name: 'Somewhere', relevance: 0.3, center: [122.076, 6.912] }],
};

// Empty Mapbox response
const MAPBOX_EMPTY = { features: [] };

describe('GeocodeClientsProcessor', () => {
  let processor: GeocodeClientsProcessor;

  beforeEach(() => {
    processor = new GeocodeClientsProcessor();
    vi.clearAllMocks();
    process.env.MAPBOX_ACCESS_TOKEN = 'test-token';

    // Default: updateProgress is a no-op
    vi.spyOn(processor as any, 'updateProgress').mockResolvedValue(undefined);
  });

  describe('batch processing', () => {
    it('fetches up to 50 pending clients and geocodes them', async () => {
      const clients = [
        { id: 'c1', psgc_id: null, province: 'Zamboanga del Sur', municipality: 'Pagadian', barangay: 'Poblacion' },
      ];

      // fetchPendingClients → returns clients
      mockPool.query.mockResolvedValueOnce({ rows: clients });
      // fetchPendingClients for psgc lookup → null psgc_id, skip psgc query
      // forwardGeocode → success
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);
      // UPDATE clients SET latitude...
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c1']);
      expect(result.failed).toEqual([]);
    });

    it('sets geocode_status = skipped when all address fields are empty', async () => {
      const clients = [{ id: 'c1', psgc_id: null, province: null, municipality: null, barangay: null }];
      mockPool.query
        .mockResolvedValueOnce({ rows: clients }) // fetchPendingClients
        .mockResolvedValueOnce({ rows: [] }); // UPDATE status = skipped

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c1']);
      // The UPDATE call should set geocode_status = 'skipped'
      const updateCall = mockPool.query.mock.calls[1];
      expect(updateCall[0]).toContain("geocode_status = 'skipped'");
    });

    it('sets geocode_status = failed when Mapbox returns empty features', async () => {
      const clients = [{ id: 'c1', psgc_id: null, province: 'Zamboanga', municipality: 'Pagadian', barangay: 'Pob' }];
      mockPool.query.mockResolvedValueOnce({ rows: clients });
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_EMPTY,
      } as any);
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE failed

      const result = await processor.process(makeJob());

      expect(result.succeeded).toEqual(['c1']);
      const updateCall = mockPool.query.mock.calls[1];
      expect(updateCall[0]).toContain("geocode_status = 'failed'");
    });

    it('sets geocode_status = failed when Mapbox relevance < 0.5', async () => {
      const clients = [{ id: 'c1', psgc_id: null, province: 'Z', municipality: 'P', barangay: 'B' }];
      mockPool.query.mockResolvedValueOnce({ rows: clients });
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_LOW_CONFIDENCE,
      } as any);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(makeJob());

      const updateCall = mockPool.query.mock.calls[1];
      expect(updateCall[0]).toContain("geocode_status = 'failed'");
    });

    it('uses psgc table names when psgc_id is present', async () => {
      const clients = [{ id: 'c1', psgc_id: 123, province: 'raw-prov', municipality: 'raw-mun', barangay: 'raw-brgy' }];
      mockPool.query
        .mockResolvedValueOnce({ rows: clients }) // fetchPendingClients
        .mockResolvedValueOnce({ rows: [{ region: 'Region IX', province: 'Zamboanga del Sur', mun_city: 'Pagadian', brgy: 'Poblacion' }] }) // PSGC lookup
        .mockResolvedValueOnce({ rows: [] }); // UPDATE success

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);

      await processor.process(makeJob());

      // The Mapbox URL should contain the standardized PSGC names, not the raw ones
      const fetchUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(fetchUrl).toContain('Poblacion');
      expect(fetchUrl).toContain('Pagadian');
      expect(fetchUrl).not.toContain('raw-brgy');
    });

    it('returns empty result when no pending clients exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(makeJob());

      expect(result.total).toBe(0);
      expect(result.succeeded).toEqual([]);
    });
  });

  describe('single-client geocoding', () => {
    it('geocodes a specific client when clientId is provided', async () => {
      const clients = [{ id: 'c99', psgc_id: null, province: 'Z', municipality: 'P', barangay: 'B' }];
      mockPool.query.mockResolvedValueOnce({ rows: clients });
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await processor.process(
        makeJob({ data: { type: 'geocode_clients', userId: 'user-1', clientId: 'c99' } })
      );

      expect(result.succeeded).toEqual(['c99']);
    });
  });

  describe('address building', () => {
    it('falls back to raw fields when psgc lookup returns no rows', async () => {
      const clients = [{ id: 'c1', psgc_id: 999, province: 'FallbackProv', municipality: 'FallbackMun', barangay: 'FallbackBrgy' }];
      mockPool.query
        .mockResolvedValueOnce({ rows: clients }) // fetchPendingClients
        .mockResolvedValueOnce({ rows: [] }); // PSGC lookup → empty

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MAPBOX_SUCCESS,
      } as any);
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE

      await processor.process(makeJob());

      const fetchUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(fetchUrl).toContain('FallbackBrgy');
      expect(fetchUrl).toContain('FallbackMun');
    });
  });
});
```

Save to `backend-imu/src/tests/unit/geocode-clients.test.ts`.

- [ ] **Step 2: Run tests — expect them to pass**

```bash
cd backend-imu
pnpm exec vitest run src/tests/unit/geocode-clients.test.ts
```

Expected: all tests pass (the processor is already implemented in Task 3).

- [ ] **Step 3: Commit**

```bash
git add backend-imu/src/tests/unit/geocode-clients.test.ts
git commit -m "test: add unit tests for GeocodeClientsProcessor"
```

---

## Task 7: Update PowerSync sync config to include lat/lng

**Files:**
- Modify: `backend-imu/powersync/sync-config.yaml`

There are **two** client streams — `clients_territory` (around line 99) and `clients_favorited` (around line 126). Both must be updated; missing one means favorited clients never get coordinates on-device.

Each stream's SELECT currently ends with:
```yaml
        touchpoint_summary, touchpoint_number, next_touchpoint
      FROM clients
```
(no table alias `c.` — the config uses bare column names)

- [ ] **Step 1: Add latitude and longitude to `clients_territory`**

In `backend-imu/powersync/sync-config.yaml`, find the `clients_territory:` block (around line 99). Change the last line of its SELECT from:

```yaml
        touchpoint_summary, touchpoint_number, next_touchpoint
      FROM clients
      WHERE deleted_at IS NULL
        AND psgc_id IS NOT NULL
```

To:

```yaml
        touchpoint_summary, touchpoint_number, next_touchpoint,
        latitude, longitude
      FROM clients
      WHERE deleted_at IS NULL
        AND psgc_id IS NOT NULL
```

- [ ] **Step 2: Add latitude and longitude to `clients_favorited`**

Find the `clients_favorited:` block (around line 126). Change its SELECT tail from:

```yaml
        touchpoint_summary, touchpoint_number, next_touchpoint
      FROM clients
      WHERE deleted_at IS NULL
        AND id IN (
```

To:

```yaml
        touchpoint_summary, touchpoint_number, next_touchpoint,
        latitude, longitude
      FROM clients
      WHERE deleted_at IS NULL
        AND id IN (
```

- [ ] **Step 3: Commit**

```bash
git add backend-imu/powersync/sync-config.yaml
git commit -m "feat: sync client latitude and longitude to mobile devices via PowerSync"
```

> **Deployment note:** After merging, push the updated sync config to the PowerSync service dashboard (or via `powersync deploy`). The mobile app will receive `latitude` and `longitude` on next sync without any app update needed.

---

## Task 8: GeofencingService (Flutter)

**Files:**
- Create: `frontend-mobile-imu/imu_flutter/lib/services/geofencing/geofencing_service.dart`

- [ ] **Step 1: Create the directory and service file**

```dart
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:powersync/powersync.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:imu_flutter/core/utils/logger.dart';
import 'package:imu_flutter/services/sync/powersync_service.dart';
import 'package:imu_flutter/services/api/client_api_service.dart';

const double _kGeofenceRadius = 400.0;
const Duration _kCooldown = Duration(hours: 16);

// Bounding box half-width: ±0.005° ≈ ~550m — wider than 400m radius
const double _kBboxDelta = 0.005;

const String _kNotificationChannelId = 'geofencing_proximity';
const String _kNotificationChannelName = 'Nearby Clients';

const String _kActionNavigate = 'action_navigate';
const String _kActionAddItinerary = 'action_add_itinerary';
const String _kActionDismiss = 'action_dismiss';

/// Proximity notification data passed to action handlers.
class _ProximityPayload {
  final String clientId;
  final double clientLat;
  final double clientLng;
  final String clientFullName;
  final String clientFullAddress;

  _ProximityPayload({
    required this.clientId,
    required this.clientLat,
    required this.clientLng,
    required this.clientFullName,
    required this.clientFullAddress,
  });

  String encode() =>
      '$clientId|$clientLat|$clientLng|${Uri.encodeComponent(clientFullName)}|${Uri.encodeComponent(clientFullAddress)}';

  static _ProximityPayload decode(String raw) {
    final parts = raw.split('|');
    return _ProximityPayload(
      clientId: parts[0],
      clientLat: double.parse(parts[1]),
      clientLng: double.parse(parts[2]),
      clientFullName: Uri.decodeComponent(parts[3]),
      clientFullAddress: Uri.decodeComponent(parts[4]),
    );
  }
}

/// GeofencingService
///
/// Owns its own Geolocator position stream (distanceFilter: 10m).
/// On each update, queries local SQLite for clients within a bounding box,
/// computes precise haversine distance, and fires a local notification
/// for any client within 400m whose 16-hour cooldown has expired.
class GeofencingService {
  final PowerSyncDatabase _db;
  StreamSubscription<Position>? _positionSub;
  final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  GeofencingService({required PowerSyncDatabase db}) : _db = db;

  Future<void> init() async {
    if (_initialized) return;

    await _initNotifications();
    await _startPositionStream();
    _initialized = true;
    logDebug('GeofencingService: initialized');
  }

  void dispose() {
    _positionSub?.cancel();
    _positionSub = null;
    logDebug('GeofencingService: disposed');
  }

  // ── Initialization ──────────────────────────────────────────────────────

  Future<void> _initNotifications() async {
    // Android 13+ requires runtime permission for POST_NOTIFICATIONS.
    if (defaultTargetPlatform == TargetPlatform.android) {
      final status = await Permission.notification.status;
      if (!status.isGranted) {
        await Permission.notification.request();
      }
    }

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _notifications.initialize(
      const InitializationSettings(android: androidInit),
      onDidReceiveNotificationResponse: _onNotificationResponse,
    );

    // Register the notification channel with action buttons.
    final androidPlugin =
        _notifications.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        _kNotificationChannelId,
        _kNotificationChannelName,
        importance: Importance.high,
      ),
    );
  }

  Future<void> _startPositionStream() async {
    // Reuse checkLocationPermission from LocationTrackingService pattern
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      logDebug('GeofencingService: location services disabled, not starting');
      return;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      logDebug('GeofencingService: location permission denied, not starting');
      return;
    }

    _positionSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen(_onPositionUpdate, onError: (e) {
      logError('GeofencingService: position stream error', e);
    });
  }

  // ── Core logic ──────────────────────────────────────────────────────────

  Future<void> _onPositionUpdate(Position position) async {
    final agentLat = position.latitude;
    final agentLng = position.longitude;

    final latMin = agentLat - _kBboxDelta;
    final latMax = agentLat + _kBboxDelta;
    final lngMin = agentLng - _kBboxDelta;
    final lngMax = agentLng + _kBboxDelta;

    // Bounding-box pre-filter eliminates >99% of clients before the precise check.
    // fullname/full_address are not in the sync config — compose display strings
    // from first_name, last_name, middle_name, barangay, municipality, province
    // which ARE synced (present in both clients_territory and clients_favorited).
    final rows = await _db.getAll(
      '''SELECT id, first_name, last_name, middle_name,
                barangay, municipality, province,
                latitude, longitude
         FROM clients
         WHERE latitude IS NOT NULL
           AND loan_released = 0
           AND deleted_at IS NULL
           AND latitude  BETWEEN ? AND ?
           AND longitude BETWEEN ? AND ?''',
      [latMin, latMax, lngMin, lngMax],
    );

    final prefs = await SharedPreferences.getInstance();
    final now = DateTime.now().millisecondsSinceEpoch;

    for (final row in rows) {
      final clientId = row['id'] as String;
      final clientLat = (row['latitude'] as num).toDouble();
      final clientLng = (row['longitude'] as num).toDouble();

      final distance = Geolocator.distanceBetween(
          agentLat, agentLng, clientLat, clientLng);
      if (distance > _kGeofenceRadius) continue;

      // Check cooldown
      final cooldownKey = 'geofence_cooldown_$clientId';
      final lastFiredMs = prefs.getInt(cooldownKey);
      if (lastFiredMs != null &&
          (now - lastFiredMs) < _kCooldown.inMilliseconds) continue;

      // Write cooldown timestamp BEFORE firing so lingering doesn't re-trigger
      await prefs.setInt(cooldownKey, now);

      // Compose display strings from synced fields
      final firstName = row['first_name'] as String? ?? '';
      final lastName = row['last_name'] as String? ?? '';
      final middleName = row['middle_name'] as String?;
      final nameParts = [
        firstName,
        if (middleName != null && middleName.isNotEmpty) middleName,
        lastName,
      ].where((s) => s.isNotEmpty).toList();
      final clientName = nameParts.isNotEmpty ? nameParts.join(' ') : 'Unknown client';

      final addressParts = [
        row['barangay'] as String?,
        row['municipality'] as String?,
        row['province'] as String?,
      ].whereType<String>().where((s) => s.isNotEmpty).toList();
      final clientAddress = addressParts.join(', ');

      await _fireNotification(
        clientId: clientId,
        clientFullName: clientName,
        clientFullAddress: clientAddress,
        clientLat: clientLat,
        clientLng: clientLng,
        distanceMeters: distance.round(),
      );
    }
  }

  Future<void> _fireNotification({
    required String clientId,
    required String clientFullName,
    required String clientFullAddress,
    required double clientLat,
    required double clientLng,
    required int distanceMeters,
  }) async {
    final hasPermission = await Permission.notification.isGranted;
    if (!hasPermission) return;

    final payload = _ProximityPayload(
      clientId: clientId,
      clientLat: clientLat,
      clientLng: clientLng,
      clientFullName: clientFullName,
      clientFullAddress: clientFullAddress,
    ).encode();

    final androidDetails = AndroidNotificationDetails(
      _kNotificationChannelId,
      _kNotificationChannelName,
      importance: Importance.high,
      priority: Priority.high,
      actions: [
        const AndroidNotificationAction(
          _kActionNavigate,
          'Navigate Now',
          showsUserInterface: true,
        ),
        const AndroidNotificationAction(
          _kActionAddItinerary,
          'Add to Itinerary',
          showsUserInterface: true,
        ),
        const AndroidNotificationAction(
          _kActionDismiss,
          'Dismiss',
          cancelNotification: true,
        ),
      ],
    );

    await _notifications.show(
      clientId.hashCode,
      'You are near $clientFullName',
      '$clientFullAddress · ${distanceMeters}m away',
      NotificationDetails(android: androidDetails),
      payload: payload,
    );

    logDebug('GeofencingService: fired notification for $clientFullName (${distanceMeters}m)');
  }

  // ── Action handlers ─────────────────────────────────────────────────────

  void _onNotificationResponse(NotificationResponse response) {
    final rawPayload = response.payload;
    if (rawPayload == null) return;

    final payload = _ProximityPayload.decode(rawPayload);

    switch (response.actionId) {
      case _kActionNavigate:
        _handleNavigate(payload);
      case _kActionAddItinerary:
        _handleAddToItinerary(payload.clientId);
      case _kActionDismiss:
        // Cooldown already set at fire time — nothing else to do.
        break;
      default:
        // Tapped the notification body itself — treat as Navigate.
        _handleNavigate(payload);
    }
  }

  void _handleNavigate(_ProximityPayload payload) {
    final uri = Uri.parse(
        'geo:${payload.clientLat},${payload.clientLng}?q=${payload.clientLat},${payload.clientLng}');
    launchUrl(uri, mode: LaunchMode.externalApplication).catchError((e) {
      logError('GeofencingService: failed to launch map URI', e);
    });
    _handleAddToItinerary(payload.clientId);
  }

  void _handleAddToItinerary(String clientId) {
    // Fire and forget — network failure is non-critical here.
    // ClientApiService.addToMyDay handles loan_released guard on the server.
    ClientApiService.addToMyDay(clientId).catchError((e) {
      logError('GeofencingService: failed to add client to itinerary', e);
    });
  }
}

// ── Riverpod provider ───────────────────────────────────────────────────────

final geofencingServiceProvider = FutureProvider<GeofencingService>((ref) async {
  final db = await PowerSyncService.database;
  final service = GeofencingService(db: db);
  await service.init();
  ref.onDispose(service.dispose);
  return service;
});
```

Save to `frontend-mobile-imu/imu_flutter/lib/services/geofencing/geofencing_service.dart`.

> **Note on `ClientApiService.addToMyDay`:** Check whether this static method exists in `lib/services/api/client_api_service.dart`. If the method is named differently (e.g., `addClientToMyDay`), adjust the call. The endpoint is `POST /api/my-day/add-client` with body `{ client_id: clientId }`.

- [ ] **Step 2: Verify ClientApiService.addToMyDay exists (or add it)**

```bash
grep -n "addToMyDay\|add-client\|addClientToMyDay" \
  frontend-mobile-imu/imu_flutter/lib/services/api/client_api_service.dart
```

If the method doesn't exist, add it to `ClientApiService`:

```dart
static Future<void> addToMyDay(String clientId) async {
  final dio = DioClient.instance;
  await dio.post('/api/my-day/add-client', data: {'client_id': clientId});
}
```

- [ ] **Step 3: Dart analysis check**

```bash
cd frontend-mobile-imu/imu_flutter
flutter analyze lib/services/geofencing/
```

Expected: no errors or warnings (unused imports or missing methods will show here).

- [ ] **Step 4: Commit**

```bash
git add frontend-mobile-imu/imu_flutter/lib/services/geofencing/geofencing_service.dart
git commit -m "feat: add GeofencingService for 400m proximity notifications"
```

---

## Task 9: Wire GeofencingService into app startup

**Files:**
- Modify: `frontend-mobile-imu/imu_flutter/lib/app.dart`

`IMUApp` in `app.dart` is already a `ConsumerStatefulWidget`; `_IMUAppState` extends `ConsumerState<IMUApp>` and already uses `ref.read(...)` in `initState()` to start services (e.g. `backgroundSyncServiceProvider`). Wire geofencing the same way.

- [ ] **Step 1: Add import to app.dart**

At the top of `frontend-mobile-imu/imu_flutter/lib/app.dart` with other service imports (around line 7):

```dart
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'services/geofencing/geofencing_service.dart';
```

- [ ] **Step 2: Call _initializeGeofencing() from initState()**

In `_IMUAppState.initState()` (around line 27), add the call alongside the other initializers:

```dart
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initializeQuickActions();
    _initializeBackgroundSync();
    _initializeGeofencing();  // ← add this
  }
```

Then add the new method to `_IMUAppState` (before or after `_initializeBackgroundSync`):

```dart
  void _initializeGeofencing() {
    if (kIsWeb || !Platform.isAndroid) return;
    // Reading the FutureProvider kicks off GeofencingService.init().
    // The provider is anchored to the root ProviderScope so the service
    // stays alive for the full app lifetime.
    ref.read(geofencingServiceProvider.future).then((_) {
      debugPrint('IMUApp: GeofencingService started');
    }).catchError((Object e) {
      debugPrint('IMUApp: GeofencingService init skipped: $e');
    });
  }
```

- [ ] **Step 3: Dart analysis check**

```bash
cd frontend-mobile-imu/imu_flutter
flutter analyze lib/app.dart
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend-mobile-imu/imu_flutter/lib/app.dart
git commit -m "feat: initialize GeofencingService on app startup (Android only)"
```

---

## Task 10: Flutter unit tests for GeofencingService

**Files:**
- Create: `frontend-mobile-imu/imu_flutter/test/unit/services/geofencing_service_test.dart`

The Flutter service uses `Geolocator`, `SharedPreferences`, `FlutterLocalNotificationsPlugin`, and `PowerSyncDatabase` — all mockable. We test the core proximity and cooldown logic by calling the private `_onPositionUpdate` method via a test-only constructor that accepts injectable dependencies.

> **Strategy:** Rather than mocking platform channels, extract the pure logic (distance check + cooldown) into a testable function and test that directly, or use `shared_preferences_platform_interface` fakes.

- [ ] **Step 1: Write the tests**

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ---------------------------------------------------------------------------
// Pure logic helpers (extracted from GeofencingService for unit-testability)
// ---------------------------------------------------------------------------

/// Returns true if the agent is within radiusMeters of the client.
bool isWithinRadius(
  double agentLat,
  double agentLng,
  double clientLat,
  double clientLng, {
  double radiusMeters = 400.0,
}) {
  final dist = Geolocator.distanceBetween(agentLat, agentLng, clientLat, clientLng);
  return dist <= radiusMeters;
}

/// Returns true if the cooldown for clientId has expired (or was never set).
bool cooldownExpired(
  String clientId,
  Map<String, int> prefs,
  Duration cooldown,
  DateTime now,
) {
  final key = 'geofence_cooldown_$clientId';
  final lastMs = prefs[key];
  if (lastMs == null) return true;
  return (now.millisecondsSinceEpoch - lastMs) >= cooldown.inMilliseconds;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('GeofencingService — proximity logic', () {
    const agentLat = 6.9000;
    const agentLng = 122.0760;

    // Client at ~350m (within radius)
    const nearClientLat = 6.9032;
    const nearClientLng = 122.0760;

    // Client at ~450m (outside radius)
    const farClientLat = 6.9040;
    const farClientLng = 122.0760;

    test('client at 399m triggers notification (within 400m)', () {
      // ~360m north of agent
      expect(
        isWithinRadius(agentLat, agentLng, nearClientLat, nearClientLng),
        isTrue,
      );
    });

    test('client at 401m does not trigger notification (outside 400m)', () {
      expect(
        isWithinRadius(agentLat, agentLng, farClientLat, farClientLng),
        isFalse,
      );
    });

    test('exact 400m boundary is included', () {
      // Approx 400m: 0.0036° latitude ≈ 400m
      const clientLat = agentLat + 0.0036;
      final dist = Geolocator.distanceBetween(agentLat, agentLng, clientLat, agentLng);
      // Should be within ±5m of 400m — test the helper, not exact GPS math
      expect(dist, lessThanOrEqualTo(410.0));
    });
  });

  group('GeofencingService — cooldown logic', () {
    const clientId = 'client-abc';
    const cooldown = Duration(hours: 16);

    test('no cooldown set → should fire notification', () {
      expect(
        cooldownExpired(clientId, {}, cooldown, DateTime.now()),
        isTrue,
      );
    });

    test('cooldown active (8 hours ago) → should NOT fire', () {
      final now = DateTime.now();
      final eightHoursAgo = now.subtract(const Duration(hours: 8));
      final prefs = {'geofence_cooldown_$clientId': eightHoursAgo.millisecondsSinceEpoch};
      expect(cooldownExpired(clientId, prefs, cooldown, now), isFalse);
    });

    test('cooldown expired (17 hours ago) → should fire', () {
      final now = DateTime.now();
      final sevenTeenHoursAgo = now.subtract(const Duration(hours: 17));
      final prefs = {'geofence_cooldown_$clientId': sevenTeenHoursAgo.millisecondsSinceEpoch};
      expect(cooldownExpired(clientId, prefs, cooldown, now), isTrue);
    });

    test('exactly at 16-hour boundary → should NOT fire (not yet expired)', () {
      final now = DateTime.now();
      final exactlyAt = now.subtract(const Duration(hours: 16));
      final prefs = {'geofence_cooldown_$clientId': exactlyAt.millisecondsSinceEpoch};
      // At exactly 16h the difference equals cooldown.inMilliseconds — not > so not expired
      expect(cooldownExpired(clientId, prefs, cooldown, now), isFalse);
    });

    test('each client has independent cooldown key', () {
      final now = DateTime.now();
      final recentMs = now.subtract(const Duration(hours: 1)).millisecondsSinceEpoch;
      final prefs = {'geofence_cooldown_client-A': recentMs};

      // client-A is on cooldown
      expect(cooldownExpired('client-A', prefs, cooldown, now), isFalse);
      // client-B has no cooldown entry → should fire
      expect(cooldownExpired('client-B', prefs, cooldown, now), isTrue);
    });
  });

  group('GeofencingService — SharedPreferences integration', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    test('cooldown key is written when notification fires', () async {
      final prefs = await SharedPreferences.getInstance();
      final clientId = 'client-xyz';
      final key = 'geofence_cooldown_$clientId';

      expect(prefs.getInt(key), isNull);

      // Simulate writing the cooldown (as GeofencingService does before firing)
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      await prefs.setInt(key, nowMs);

      final stored = prefs.getInt(key);
      expect(stored, isNotNull);
      expect((DateTime.now().millisecondsSinceEpoch - stored!),
          lessThan(1000)); // written < 1s ago
    });
  });
}
```

Save to `frontend-mobile-imu/imu_flutter/test/unit/services/geofencing_service_test.dart`.

- [ ] **Step 2: Run the tests**

```bash
cd frontend-mobile-imu/imu_flutter
flutter test test/unit/services/geofencing_service_test.dart
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend-mobile-imu/imu_flutter/test/unit/services/geofencing_service_test.dart
git commit -m "test: add unit tests for geofencing proximity and cooldown logic"
```

---

## Task 11: Initial geocoding backfill job

The migration in Task 1 set `geocode_status = 'pending'` for all existing clients (via the `DEFAULT 'pending'` on the new column). The batch processor in Task 3 fetches 50 at a time per job run, so a one-time admin enqueue triggers the backfill cascade.

- [ ] **Step 1: Add a one-time backfill endpoint (or use existing admin tooling)**

In `backend-imu/src/routes/clients.ts`, add after existing admin-only routes (search for other `POST .../admin` patterns to find the right place, or append before the export):

```typescript
// POST /api/clients/geocode/backfill — enqueue a one-time geocoding backfill for all pending clients
// Admin only. Each job run processes 50 clients; subsequent runs handle the next batch.
clients.post('/geocode/backfill', authMiddleware, requirePermission('clients', 'update'), async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin only' }, 403);
  }

  const { count } = (await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM clients WHERE geocode_status = 'pending' AND deleted_at IS NULL`
  )).rows[0];

  const batchCount = Math.ceil(Number(count) / 50);

  // Enqueue one job per 50-client batch with staggered delays
  for (let i = 0; i < batchCount; i++) {
    await addGeocodingJob(user.sub, undefined, { delay: i * 15_000 }); // 15s apart
  }

  return c.json({ message: `Enqueued ${batchCount} geocoding job(s) for ${count} pending client(s)` });
});
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd backend-imu
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend-imu/src/routes/clients.ts
git commit -m "feat: add POST /api/clients/geocode/backfill admin endpoint for one-time geocoding"
```

- [ ] **Step 4: Run the backfill after deployment**

```bash
curl -X POST https://<api-host>/api/clients/geocode/backfill \
  -H "Authorization: Bearer <admin-token>"
```

Expected response: `{ "message": "Enqueued N geocoding job(s) for M pending client(s)" }`

---

## Manual Smoke Test Checklist

After deploying backend + pushing sync config + releasing app build:

- [ ] `GET /api/clients/:id` for a geocoded client returns `latitude` and `longitude` fields
- [ ] Device syncs — open the PowerSync inspector or check local SQLite: `SELECT id, latitude, longitude FROM clients WHERE latitude IS NOT NULL LIMIT 5`
- [ ] Set GPS to coordinates within 400m of a geocoded client → notification appears within one 10m movement update
- [ ] Dismiss notification → re-simulate GPS within 16 hours → no second notification
- [ ] Wait (or manually advance SharedPreferences timestamp) 16+ hours → notification re-fires
- [ ] Tap "Navigate Now" → default map app opens at client coordinates; client appears in today's My Day list
- [ ] Tap "Add to Itinerary" → client appears in My Day; map app does NOT open
- [ ] Tap "Dismiss" → no API call made; no map opens
- [ ] Client with `loan_released = true` → no notification even within 400m
