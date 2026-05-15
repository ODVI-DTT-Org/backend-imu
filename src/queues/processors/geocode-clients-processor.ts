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
