/**
 * Location Assignments Processor
 *
 * Handles location assignment jobs including:
 * - PSGC matching operations
 * - Bulk user municipality assignments
 * - Bulk group municipality assignments
 * - Bulk caravan municipality assignments
 */

import { Job } from 'bullmq';
import { pool } from '../../db/index.js';
import { BaseProcessor } from '../base-processor.js';
import type { BulkJobData, JobResult } from '../jobs/job-types.js';
import { batchItems, createJobResult, handleJobError } from '../utils/job-helpers.js';
import { logger } from '../../utils/logger.js';

interface PsgcClientMatch {
  clientId: string;
  psgcId: number;
  region: string | null;
  province: string | null;
  municipality: string | null;
  barangay: string | null;
}

interface PsgcClientCandidate {
  clientId: string;
  municipality: string;
  province: string;
  fullAddress: string | null;
}

interface PsgcBatchResolution {
  matches: PsgcClientMatch[];
  failed: Array<{ id: string; error: string }>;
}

type BatchProgressCallback = (batchProcessed: number) => Promise<void>;

/**
 * Location Assignments Processor
 */
export class LocationAssignmentsProcessor extends BaseProcessor<BulkJobData, JobResult> {
  constructor() {
    super('location-assignments');
  }

  /**
   * Process location assignment job
   */
  async process(job: Job<BulkJobData>): Promise<JobResult> {
    const { type, userId, params } = job.data;
    const startedAt = new Date();

    // For psgc_matching the route handler intentionally sends items=[] to avoid
    // storing thousands of UUIDs in Redis (OOM). Fetch them fresh from DB here.
    let items: string[];
    if (type === 'psgc_matching' && params?.fetchUnmatchedFromDb) {
      const result = await pool.query<{ id: string }>(`
        SELECT id FROM clients
        WHERE psgc_id IS NULL AND deleted_at IS NULL
          AND province IS NOT NULL AND municipality IS NOT NULL
        ORDER BY created_at ASC
      `);
      items = result.rows.map((row) => row.id);
      logger.info('PSGCMatching', `Job ${job.id} fetched ${items.length} unmatched clients from DB`);
    } else {
      items = job.data.items;
    }

    // Validate job data
    if (!items || items.length === 0) {
      logger.warn('PSGCMatching', `Job ${job.id} received no items for type=${type}`);
      throw new Error('No items to process');
    }

    // Process in batches
    const batchSize = this.getBatchSize(type);
    const batches = batchItems(items, batchSize);

    logger.info(
      'PSGCMatching',
      `Job ${job.id} started type=${type} user=${userId} total_items=${items.length} batch_size=${batchSize} total_batches=${batches.length}`
    );

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchLabel = `Processing batch ${i + 1} of ${batches.length}`;
      const completedBeforeBatch = succeeded.length + failed.length;

      const reportProgress = async (batchProcessed: number) => {
        const current = Math.min(items.length, completedBeforeBatch + batchProcessed);
        const progress = items.length === 0
          ? 0
          : Math.min(99, Math.floor((current / items.length) * 100));

        await this.updateProgress(job, {
          progress,
          total: items.length,
          current,
          message: batchLabel,
          succeeded,
          failed,
        });
      };

      await reportProgress(0);

      logger.info(
        'PSGCMatching',
        `Job ${job.id} processing batch=${i + 1}/${batches.length} batch_items=${batch.length} succeeded_so_far=${succeeded.length} failed_so_far=${failed.length}`
      );

      // Process batch with transaction
      const batchResult = await this.processBatch(batch, type, userId, params, reportProgress);
      succeeded.push(...batchResult.succeeded);
      failed.push(...batchResult.failed);

      await reportProgress(batch.length);

      logger.info(
        'PSGCMatching',
        `Job ${job.id} finished batch=${i + 1}/${batches.length} batch_succeeded=${batchResult.succeeded.length} batch_failed=${batchResult.failed.length} total_succeeded=${succeeded.length} total_failed=${failed.length}`
      );
    }

    await this.updateProgress(job, {
      progress: 100,
      total: items.length,
      current: items.length,
      message: 'PSGC matching completed',
      succeeded,
      failed,
    });

    logger.info(
      'PSGCMatching',
      `Job ${job.id} completed type=${type} total=${items.length} succeeded=${succeeded.length} failed=${failed.length}`
    );

    return createJobResult(items.length, succeeded, failed, startedAt, {
      operation: type,
      processed: 'assigned',
    });
  }

  private getBatchSize(operation: string): number {
    if (operation === 'psgc_matching') {
      return parseInt(process.env.PSGC_MATCHING_BATCH_SIZE || '500');
    }

    return 20;
  }

  /**
   * Process a batch of location assignments with transaction
   */
  private async processBatch(
    ids: string[],
    operation: string,
    userId: string,
    params?: Record<string, any>,
    onProgress?: BatchProgressCallback
  ): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    let detailedFailureLogs = 0;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (operation === 'psgc_matching') {
        const resolution = await this.resolvePsgcMatches(client, ids, onProgress);
        succeeded.push(...resolution.matches.map((match) => match.clientId));

        for (const failure of resolution.failed) {
          if (detailedFailureLogs < 5) {
            logger.warn(
              'PSGCMatching',
              `Client failed job_operation=${operation} client_id=${failure.id} error=${failure.error}`
            );
            detailedFailureLogs += 1;
          }
          failed.push({
            id: failure.id,
            error: handleJobError(new Error(failure.error), failure.id, { operation }),
          });
        }

        if (resolution.matches.length > 0) {
          await this.bulkUpdateMatchedClients(client, resolution.matches);
        }
      } else {
        const progressInterval = ids.length;

        for (let index = 0; index < ids.length; index++) {
          const id = ids[index];
          try {
            switch (operation) {
              case 'bulk_assign_user_psgc':
                await this.assignUserPsgc(client, id, params);
                break;
              case 'bulk_assign_user_municipalities':
                await this.assignUserMunicipalities(client, id, params);
                break;
              case 'bulk_assign_group_municipalities':
                await this.assignGroupMunicipalities(client, id, params);
                break;
              case 'bulk_assign_caravan_municipalities':
                await this.assignCaravanMunicipalities(client, id, params);
                break;
              default:
                throw new Error(`Unknown location assignment operation: ${operation}`);
            }

            succeeded.push(id);
          } catch (error: any) {
            failed.push({
              id,
              error: handleJobError(error, id, { operation }),
            });
          }

          const batchProcessed = index + 1;
          if (onProgress && (batchProcessed % progressInterval === 0 || batchProcessed === ids.length)) {
            await onProgress(batchProcessed);
          }
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(
        'PSGCMatching',
        error as Error,
        `Batch transaction failed operation=${operation} batch_size=${ids.length}`
      );
      throw error;
    } finally {
      client.release();
    }

    if (operation === 'psgc_matching') {
      logger.info(
        'PSGCMatching',
        `Batch committed operation=${operation} batch_size=${ids.length} succeeded=${succeeded.length} failed=${failed.length}`
      );
    }

    return { succeeded, failed };
  }

  private async resolvePsgcMatches(
    client: any,
    ids: string[],
    onProgress?: BatchProgressCallback
  ): Promise<PsgcBatchResolution> {
    const failed: Array<{ id: string; error: string }> = [];
    const matchesById = new Map<string, PsgcClientMatch>();

    const reportProgress = async (ratio: number) => {
      if (!onProgress) return;
      const current = Math.max(1, Math.min(ids.length, Math.floor(ids.length * ratio)));
      await onProgress(current);
    };

    // JOIN primary address so we can fall back to addresses.city/province
    // when the inline client fields are empty or absent.
    // addresses.city maps to clients.municipality (different naming convention).
    const clientResult = await client.query(
      `SELECT
         c.id::text AS client_id,
         COALESCE(NULLIF(TRIM(c.municipality), ''), NULLIF(TRIM(a.city), ''))    AS municipality,
         COALESCE(NULLIF(TRIM(c.province),     ''), NULLIF(TRIM(a.province), '')) AS province,
         c.full_address
       FROM clients c
       LEFT JOIN addresses a
         ON a.client_id = c.id
        AND a.is_primary = TRUE
        AND a.deleted_at IS NULL
       WHERE c.id = ANY($1::uuid[])
         AND c.deleted_at IS NULL
         AND c.psgc_id IS NULL`,
      [ids]
    );

    const clientMap = new Map<string, {
      municipality: string | null;
      province: string | null;
      fullAddress: string | null;
    }>();
    for (const row of clientResult.rows) {
      clientMap.set(row.client_id, {
        municipality: row.municipality,
        province: row.province,
        fullAddress: row.full_address ?? null,
      });
    }

    const eligibleClients: PsgcClientCandidate[] = [];
    for (const id of ids) {
      const clientRow = clientMap.get(id);

      if (!clientRow) {
        failed.push({ id, error: 'Client not found' });
        continue;
      }

      if (!clientRow.municipality || !clientRow.province) {
        failed.push({ id, error: 'Client missing municipality or province data (checked inline fields and primary address)' });
        continue;
      }

      eligibleClients.push({
        clientId: id,
        municipality: clientRow.municipality,
        province: clientRow.province,
        fullAddress: clientRow.fullAddress,
      });
    }

    await reportProgress(0.15);

    const exactMatches = await this.findExactPsgcMatches(client, eligibleClients);
    exactMatches.forEach((match) => matchesById.set(match.clientId, match));
    await reportProgress(0.45);

    const unmatchedAfterExact = eligibleClients.filter((candidate) => !matchesById.has(candidate.clientId));
    const normalizedMatches = await this.findNormalizedPsgcMatches(client, unmatchedAfterExact);
    normalizedMatches.forEach((match) => matchesById.set(match.clientId, match));
    await reportProgress(0.7);

    const unmatchedAfterNormalized = unmatchedAfterExact.filter((candidate) => !matchesById.has(candidate.clientId));
    const trigramMatches = await this.findTrigramPsgcMatches(client, unmatchedAfterNormalized);
    trigramMatches.forEach((match) => matchesById.set(match.clientId, match));
    await reportProgress(0.9);

    const unmatchedAfterTrigram = unmatchedAfterNormalized.filter((candidate) => !matchesById.has(candidate.clientId));
    const fullAddressMatches = await this.findFullAddressPsgcMatches(
      client,
      unmatchedAfterTrigram.filter((candidate) => Boolean(candidate.fullAddress))
    );
    fullAddressMatches.forEach((match) => matchesById.set(match.clientId, match));
    await reportProgress(0.97);

    const unresolvedClients = unmatchedAfterTrigram.filter((candidate) => !matchesById.has(candidate.clientId));
    for (const unresolved of unresolvedClients) {
      logger.warn(
        'PSGCMatching',
        `No PSGC match found client_id=${unresolved.clientId} province="${unresolved.province}" municipality="${unresolved.municipality}"`
      );
      failed.push({ id: unresolved.clientId, error: 'No matching PSGC record found' });
    }

    return {
      matches: eligibleClients
        .map((candidate) => matchesById.get(candidate.clientId))
        .filter((match): match is PsgcClientMatch => Boolean(match)),
      failed,
    };
  }

  private async findExactPsgcMatches(client: any, candidates: PsgcClientCandidate[]): Promise<PsgcClientMatch[]> {
    if (candidates.length === 0) return [];

    const result = await client.query(
      `WITH input AS (
         SELECT *
         FROM unnest($1::uuid[], $2::text[], $3::text[]) AS input(client_id, municipality, province)
       )
       SELECT DISTINCT ON (input.client_id)
         input.client_id::text AS client_id,
         p.id AS psgc_id,
         p.region,
         p.province,
         p.mun_city AS municipality,
         p.barangay
       FROM input
       INNER JOIN psgc p
         ON lower(p.mun_city) = lower(input.municipality)
        AND lower(p.province) = lower(input.province)
       ORDER BY input.client_id, p.id`,
      this.buildPsgcCandidateParams(candidates)
    );

    return result.rows.map((row: any) => this.mapPsgcMatchRow(row));
  }

  private async findNormalizedPsgcMatches(client: any, candidates: PsgcClientCandidate[]): Promise<PsgcClientMatch[]> {
    if (candidates.length === 0) return [];

    const result = await client.query(
      `WITH input AS (
         SELECT *
         FROM unnest($1::uuid[], $2::text[], $3::text[]) AS input(client_id, municipality, province)
       )
       SELECT DISTINCT ON (input.client_id)
         input.client_id::text AS client_id,
         p.id AS psgc_id,
         p.region,
         p.province,
         p.mun_city AS municipality,
         p.barangay
       FROM input
       INNER JOIN psgc p
         ON lower(regexp_replace(p.mun_city, '(^city of\\s+|^city\\s+|\\s+city$)', '', 'gi')) =
            lower(regexp_replace(input.municipality, '(^city of\\s+|^city\\s+|\\s+city$)', '', 'gi'))
        AND lower(p.province) = lower(input.province)
       ORDER BY input.client_id, p.id`,
      this.buildPsgcCandidateParams(candidates)
    );

    return result.rows.map((row: any) => this.mapPsgcMatchRow(row));
  }

  private async findTrigramPsgcMatches(client: any, candidates: PsgcClientCandidate[]): Promise<PsgcClientMatch[]> {
    if (candidates.length === 0) return [];

    const result = await client.query(
      `WITH input AS (
         SELECT *
         FROM unnest($1::uuid[], $2::text[], $3::text[]) AS input(client_id, municipality, province)
       )
       SELECT
         input.client_id::text AS client_id,
         p.id AS psgc_id,
         p.region,
         p.province,
         p.mun_city AS municipality,
         p.barangay
       FROM input
       INNER JOIN LATERAL (
         SELECT id, region, province, mun_city, barangay
         FROM psgc p
         WHERE similarity(lower(p.mun_city), lower(input.municipality)) >= 0.35
           AND similarity(lower(p.province), lower(input.province)) >= 0.5
         ORDER BY (similarity(lower(p.mun_city), lower(input.municipality)) + similarity(lower(p.province), lower(input.province))) DESC
         LIMIT 1
       ) p ON true`,
      this.buildPsgcCandidateParams(candidates)
    );

    return result.rows.map((row: any) => this.mapPsgcMatchRow(row));
  }

  private async findFullAddressPsgcMatches(client: any, candidates: PsgcClientCandidate[]): Promise<PsgcClientMatch[]> {
    if (candidates.length === 0) return [];

    const result = await client.query(
      `WITH input AS (
         SELECT
           input.client_id,
           input.full_address,
           lower(regexp_replace(input.full_address, '[^a-z0-9]+', ' ', 'gi')) AS normalized_full_address
         FROM unnest($1::uuid[], $2::text[]) AS input(client_id, full_address)
       )
       SELECT DISTINCT ON (input.client_id)
         input.client_id::text AS client_id,
         p.id AS psgc_id,
         p.region,
         p.province,
         p.mun_city AS municipality,
         p.barangay
       FROM input
       INNER JOIN psgc p
         ON input.normalized_full_address LIKE '%' || lower(regexp_replace(p.province, '[^a-z0-9]+', ' ', 'gi')) || '%'
        AND input.normalized_full_address LIKE '%' || lower(regexp_replace(regexp_replace(p.mun_city, '(^city of\\s+|^city\\s+|\\s+city$)', '', 'gi'), '[^a-z0-9]+', ' ', 'gi')) || '%'
       ORDER BY input.client_id, length(p.mun_city) DESC, p.id`,
      [
        candidates.map((candidate) => candidate.clientId),
        candidates.map((candidate) => candidate.fullAddress as string),
      ]
    );

    return result.rows.map((row: any) => this.mapPsgcMatchRow(row));
  }

  private buildPsgcCandidateParams(candidates: PsgcClientCandidate[]): [string[], string[], string[]] {
    return [
      candidates.map((candidate) => candidate.clientId),
      candidates.map((candidate) => candidate.municipality),
      candidates.map((candidate) => candidate.province),
    ];
  }

  private mapPsgcMatchRow(row: any): PsgcClientMatch {
    return {
      clientId: row.client_id,
      psgcId: Number(row.psgc_id),
      region: row.region ?? null,
      province: row.province ?? null,
      municipality: row.municipality ?? null,
      barangay: row.barangay ?? null,
    };
  }

  private async bulkUpdateMatchedClients(client: any, matches: PsgcClientMatch[]): Promise<void> {
    const valuesSql = matches
      .map((_, index) => {
        const offset = index * 6;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      })
      .join(', ');

    const params = matches.flatMap((match) => [
      match.clientId,
      match.psgcId,
      match.region,
      match.province,
      match.municipality,
      match.barangay,
    ]);

    await client.query(
      `UPDATE clients AS c
       SET
         psgc_id = updates.psgc_id::integer,
         region = COALESCE(updates.region, c.region),
         province = COALESCE(updates.province, c.province),
         municipality = COALESCE(updates.municipality, c.municipality),
         barangay = COALESCE(updates.barangay, c.barangay),
         updated_at = NOW()
       FROM (
         VALUES ${valuesSql}
       ) AS updates(client_id, psgc_id, region, province, municipality, barangay)
       WHERE c.id = updates.client_id::uuid
         AND c.deleted_at IS NULL
         AND c.psgc_id IS NULL`,
      params
    );

    // Also sync psgc_id onto the primary address row so addresses table stays consistent
    await client.query(
      `UPDATE addresses AS a
       SET psgc_id = updates.psgc_id::integer,
           updated_at = NOW()
       FROM (
         VALUES ${valuesSql}
       ) AS updates(client_id, psgc_id, region, province, municipality, barangay)
       WHERE a.client_id = updates.client_id::uuid
         AND a.is_primary = TRUE
         AND a.deleted_at IS NULL
         AND a.psgc_id IS NULL`,
      params
    );
  }

  /**
   * Assign PSGC to user
   */
  private async assignUserPsgc(client: any, userId: string, params?: any): Promise<void> {
    const { psgcId } = params || {};

    if (!psgcId) {
      throw new Error('PSGC ID is required');
    }

    // Check if PSGC exists
    const psgcResult = await client.query(
      'SELECT id FROM psgc WHERE id = $1',
      [psgcId]
    );

    if (psgcResult.rows.length === 0) {
      throw new Error('PSGC not found');
    }

    // Assign PSGC to user (create or update user_psgc assignment)
    await client.query(
      `INSERT INTO user_psgc (id, user_id, psgc_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
       ON CONFLICT (user_id, psgc_id)
       DO UPDATE SET updated_at = NOW()`,
      [userId, psgcId]
    );
  }

  /**
   * Assign municipalities to user
   */
  private async assignUserMunicipalities(client: any, userId: string, params?: any): Promise<void> {
    const { municipalityIds } = params || {};

    if (!municipalityIds || !Array.isArray(municipalityIds)) {
      throw new Error('Municipality IDs array is required');
    }

    // Clear existing assignments
    await client.query(
      'DELETE FROM user_municipalities WHERE user_id = $1',
      [userId]
    );

    // Assign new municipalities
    for (const municipalityId of municipalityIds) {
      await client.query(
        `INSERT INTO user_municipalities (id, user_id, municipality_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())`,
        [userId, municipalityId]
      );
    }
  }

  /**
   * Assign municipalities to group
   */
  private async assignGroupMunicipalities(client: any, groupId: string, params?: any): Promise<void> {
    const { municipalityIds } = params || {};

    if (!municipalityIds || !Array.isArray(municipalityIds)) {
      throw new Error('Municipality IDs array is required');
    }

    // Clear existing assignments
    await client.query(
      'DELETE FROM group_municipalities WHERE group_id = $1',
      [groupId]
    );

    // Assign new municipalities
    for (const municipalityId of municipalityIds) {
      await client.query(
        `INSERT INTO group_municipalities (id, group_id, municipality_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())`,
        [groupId, municipalityId]
      );
    }
  }

  /**
   * Assign municipalities to caravan
   */
  private async assignCaravanMunicipalities(client: any, caravanId: string, params?: any): Promise<void> {
    const { municipalityIds } = params || {};

    if (!municipalityIds || !Array.isArray(municipalityIds)) {
      throw new Error('Municipality IDs array is required');
    }

    // Clear existing assignments
    await client.query(
      'DELETE FROM caravan_municipalities WHERE caravan_id = $1',
      [caravanId]
    );

    // Assign new municipalities
    for (const municipalityId of municipalityIds) {
      await client.query(
        `INSERT INTO caravan_municipalities (id, caravan_id, municipality_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())`,
        [caravanId, municipalityId]
      );
    }
  }

  /**
   * Override concurrency for location assignments
   */
  protected getConcurrency(): number {
    return parseInt(process.env.QUEUE_CONCURRENCY_LOCATION_ASSIGNMENTS || '5');
  }
}

/**
 * Export singleton instance getter
 */
export const locationAssignmentsProcessor = new LocationAssignmentsProcessor();
