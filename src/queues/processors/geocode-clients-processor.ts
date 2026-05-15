/**
 * Geocode Clients Processor
 *
 * 3-step pipeline per client:
 *   1. Postgres — if psgc_id is set, read pin_location directly from psgc table.
 *   2. Haiku AI — text-search psgc for candidates, ask Claude Haiku to pick the
 *      best match, then fall through to step 1 with the resolved psgc_id.
 *   3. Mapbox — forward geocoding as the final fallback.
 *
 * MAPBOX_ACCESS_TOKEN is required only when Mapbox fallback is reached.
 * ANTHROPIC_API_KEY is required only when Haiku matching is attempted.
 */

import Anthropic from '@anthropic-ai/sdk';
import { Job } from 'bullmq';
import { pool } from '../../db/index.js';
import { BaseProcessor } from '../base-processor.js';
import type { GeocodingJobData, JobResult } from '../jobs/job-types.js';
import { createJobResult } from '../utils/job-helpers.js';
import { logger } from '../../utils/logger.js';

const BATCH_SIZE = 50;
const MAPBOX_DELAY_MS = 300;
const PH_BBOX = '116.9,4.6,126.6,21.1';
const MIN_CONFIDENCE = 0.5;
const MAPBOX_TIMEOUT_MS = 8000;
const HAIKU_CANDIDATE_LIMIT = 10;

interface PendingClient {
  id: string;
  psgc_id: number | null;
  province: string | null;
  municipality: string | null;
  barangay: string | null;
}

interface PsgcCoords {
  lat: number;
  lng: number;
}

interface PsgcCandidate {
  id: number;
  region: string;
  province: string;
  mun_city: string;
  barangay: string;
  has_coords: boolean;
}

interface MapboxFeature {
  place_name: string;
  relevance: number;
  center: [number, number]; // [lng, lat]
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
        const geocoded = await this.geocodeClient(client);
        if (geocoded) {
          succeeded.push(client.id);
        } else {
          // skipped counts as succeeded — status already written
          succeeded.push(client.id);
        }
      } catch (err: any) {
        failed.push({ id: client.id, error: err.message });
        logger.warn('GeocodeClients', `Client ${client.id} failed: ${err.message}`);
        await pool.query(`UPDATE clients SET geocode_status = 'failed' WHERE id = $1`, [client.id]);
      }

      if (i < clients.length - 1) await this.delay(MAPBOX_DELAY_MS);

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

  // ── Fetch helpers ──────────────────────────────────────────────────────

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

  // ── Main geocoding logic ───────────────────────────────────────────────

  /**
   * Returns true if coordinates were saved, false if skipped.
   * Throws on unrecoverable error (caller marks as failed).
   */
  private async geocodeClient(client: PendingClient): Promise<boolean> {
    if (!client.province && !client.municipality && !client.barangay && !client.psgc_id) {
      await pool.query(`UPDATE clients SET geocode_status = 'skipped' WHERE id = $1`, [client.id]);
      return false;
    }

    // Step 1: Direct PSGC pin_location lookup (free, no API call)
    if (client.psgc_id) {
      const coords = await this.lookupPsgcCoords(client.psgc_id);
      if (coords) {
        await this.saveCoords(client.id, coords.lat, coords.lng);
        logger.info('GeocodeClients', `Client ${client.id} geocoded via PSGC (step 1)`);
        return true;
      }
    }

    // Step 2: Haiku AI — find best PSGC match from text candidates
    const haikuPsgcId = await this.matchWithHaiku(client);
    if (haikuPsgcId) {
      const coords = await this.lookupPsgcCoords(haikuPsgcId);
      if (coords) {
        // Persist the resolved psgc_id so future lookups skip Haiku
        await pool.query(`UPDATE clients SET psgc_id = $1 WHERE id = $2`, [haikuPsgcId, client.id]);
        await this.saveCoords(client.id, coords.lat, coords.lng);
        logger.info('GeocodeClients', `Client ${client.id} geocoded via Haiku+PSGC (step 2)`);
        return true;
      }
    }

    // Step 3: Mapbox forward geocoding fallback
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (token) {
      const query = this.buildRawAddressString(client);
      const feature = await this.forwardGeocode(query, token);
      if (feature && this.isWithinPhilippines(feature.center[0], feature.center[1])) {
        await this.saveCoords(client.id, feature.center[1], feature.center[0]);
        logger.info('GeocodeClients', `Client ${client.id} geocoded via Mapbox (step 3)`);
        return true;
      }
    }

    await pool.query(`UPDATE clients SET geocode_status = 'failed' WHERE id = $1`, [client.id]);
    return false;
  }

  // ── Step 1: PSGC pin_location ──────────────────────────────────────────

  private async lookupPsgcCoords(psgcId: number): Promise<PsgcCoords | null> {
    const result = await pool.query<{ lat: string | null; lng: string | null }>(
      `SELECT pin_location->>'latitude'  AS lat,
              pin_location->>'longitude' AS lng
       FROM psgc
       WHERE id = $1 AND pin_location IS NOT NULL`,
      [psgcId]
    );
    if (!result.rows.length) return null;
    const { lat, lng } = result.rows[0];
    if (!lat || !lng) return null;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) return null;
    return { lat: latitude, lng: longitude };
  }

  // ── Step 2: Haiku AI matching ──────────────────────────────────────────

  private async matchWithHaiku(client: PendingClient): Promise<number | null> {
    const candidates = await this.fetchPsgcCandidates(client);
    if (candidates.length === 0) return null;

    // If exactly one candidate has coordinates, use it without calling Haiku
    const withCoords = candidates.filter((c) => c.has_coords);
    if (withCoords.length === 1) return withCoords[0].id;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    return this.selectWithHaiku(client, candidates, apiKey);
  }

  private async fetchPsgcCandidates(client: PendingClient): Promise<PsgcCandidate[]> {
    const conditions: string[] = [];
    const params: string[] = [];
    let idx = 1;

    if (client.province) {
      conditions.push(`LOWER(province) ILIKE $${idx++}`);
      params.push(`%${client.province.toLowerCase()}%`);
    }
    if (client.municipality) {
      conditions.push(`LOWER(mun_city) ILIKE $${idx++}`);
      params.push(`%${client.municipality.toLowerCase()}%`);
    }
    if (client.barangay) {
      conditions.push(`LOWER(barangay) ILIKE $${idx++}`);
      params.push(`%${client.barangay.toLowerCase()}%`);
    }

    if (conditions.length === 0) return [];

    const result = await pool.query<PsgcCandidate>(
      `SELECT id, region, province, mun_city, barangay,
              (pin_location IS NOT NULL
               AND pin_location->>'latitude'  IS NOT NULL
               AND pin_location->>'longitude' IS NOT NULL) AS has_coords
       FROM psgc
       WHERE ${conditions.join(' AND ')}
       ORDER BY has_coords DESC
       LIMIT $${idx}`,
      [...params, HAIKU_CANDIDATE_LIMIT]
    );
    return result.rows;
  }

  private async selectWithHaiku(
    client: PendingClient,
    candidates: PsgcCandidate[],
    apiKey: string
  ): Promise<number | null> {
    const anthropic = new Anthropic({ apiKey });

    const rawAddress = [client.barangay, client.municipality, client.province]
      .filter(Boolean)
      .join(', ');

    const candidateList = candidates
      .map(
        (c, i) =>
          `${i + 1}. ID=${c.id} | ${c.barangay}, ${c.mun_city}, ${c.province}, ${c.region}` +
          (c.has_coords ? ' [has coordinates]' : ' [no coordinates]')
      )
      .join('\n');

    const prompt =
      `You are matching a Philippine client address to its official PSGC barangay record.\n\n` +
      `Raw address from client record: "${rawAddress}"\n\n` +
      `PSGC candidates (prefer ones with coordinates):\n${candidateList}\n\n` +
      `Reply with ONLY the numeric ID of the best match, or "none" if no candidate is a reasonable match.`;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 16,
        messages: [{ role: 'user', content: prompt }],
      });

      const text =
        message.content[0]?.type === 'text' ? message.content[0].text.trim().toLowerCase() : '';

      if (text === 'none' || text === '') return null;

      const parsed = parseInt(text, 10);
      const valid = candidates.find((c) => c.id === parsed);
      return valid ? parsed : null;
    } catch (err: any) {
      logger.warn('GeocodeClients', `Haiku matching failed for client ${client.id}: ${err.message}`);
      return null;
    }
  }

  // ── Step 3: Mapbox forward geocoding ─────────────────────────────────

  private buildRawAddressString(client: PendingClient): string {
    const parts = [client.barangay, client.municipality, client.province].filter(Boolean);
    return `${parts.join(', ')}, Philippines`;
  }

  private async forwardGeocode(query: string, token: string): Promise<MapboxFeature | null> {
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
      if (!res.ok) throw new Error(`Mapbox HTTP ${res.status}`);
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

  // ── Shared helpers ──────────────────────────────────────────────────────

  private async saveCoords(clientId: string, lat: number, lng: number): Promise<void> {
    await pool.query(
      `UPDATE clients
       SET latitude = $1, longitude = $2, geocoded_at = NOW(), geocode_status = 'success'
       WHERE id = $3`,
      [lat, lng, clientId]
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const geocodeClientsProcessor = new GeocodeClientsProcessor();
