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
  psgcId: string;
  region: string | null;
  province: string | null;
  municipality: string | null;
  barangay: string | null;
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
    const { type, userId, items, params } = job.data;
    const startedAt = new Date();

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
    const matchedClients: PsgcClientMatch[] = [];
    const progressInterval = operation === 'psgc_matching'
      ? Math.max(1, Math.min(25, Math.ceil(ids.length / 10)))
      : ids.length;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let index = 0; index < ids.length; index++) {
        const id = ids[index];
        try {
          switch (operation) {
            case 'psgc_matching':
              matchedClients.push(await this.resolvePsgcMatch(client, id));
              break;
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
          if (operation === 'psgc_matching' && detailedFailureLogs < 5) {
            logger.warn(
              'PSGCMatching',
              `Client failed job_operation=${operation} client_id=${id} error=${error?.message || 'Unknown error'}`
            );
            detailedFailureLogs += 1;
          }
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

      if (operation === 'psgc_matching' && matchedClients.length > 0) {
        await this.bulkUpdateMatchedClients(client, matchedClients);
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

  /**
   * Process PSGC matching for a single client using 3-strategy cascade:
   * 1. Exact case-insensitive match
   * 2. Normalized match (strips CITY OF / CITY prefix/suffix)
   * 3. Trigram similarity fallback (requires pg_trgm extension)
   */
  private async resolvePsgcMatch(client: any, clientId: string): Promise<PsgcClientMatch> {
    const clientResult = await client.query(
      'SELECT municipality, province FROM clients WHERE id = $1 AND deleted_at IS NULL',
      [clientId]
    );

    if (clientResult.rows.length === 0) throw new Error('Client not found');

    const { municipality, province } = clientResult.rows[0];
    if (!municipality || !province) throw new Error('Client missing municipality or province data');

    const cols = 'id, region, province, mun_city, barangay';

    // Strategy 1: exact case-insensitive match
    let psgcResult = await client.query(
      `SELECT ${cols} FROM psgc
       WHERE lower(mun_city) = lower($1) AND lower(province) = lower($2)
       LIMIT 1`,
      [municipality, province]
    );

    // Strategy 2: normalized match — strip leading/trailing CITY variants
    if (psgcResult.rows.length === 0) {
      const norm = (s: string) => s.replace(/ CITY$/i, '').replace(/^(CITY OF|CITY)\s*/i, '').trim();
      psgcResult = await client.query(
        `SELECT ${cols} FROM psgc
         WHERE lower(regexp_replace(mun_city, '(^city of\\s+|^city\\s+|\\s+city$)', '', 'gi')) = lower($1)
           AND lower(province) = lower($2)
         LIMIT 1`,
        [norm(municipality), province]
      );
    }

    // Strategy 3: trigram similarity
    if (psgcResult.rows.length === 0) {
      psgcResult = await client.query(
        `SELECT ${cols} FROM psgc
         WHERE similarity(lower(mun_city), lower($1)) >= 0.35
           AND similarity(lower(province), lower($2)) >= 0.5
         ORDER BY (similarity(lower(mun_city), lower($1)) + similarity(lower(province), lower($2))) DESC
         LIMIT 1`,
        [municipality, province]
      );
    }

    if (psgcResult.rows.length === 0) {
      logger.warn(
        'PSGCMatching',
        `No PSGC match found client_id=${clientId} province="${province}" municipality="${municipality}"`
      );
      throw new Error('No matching PSGC record found');
    }

    const psgc = psgcResult.rows[0];

    return {
      clientId,
      psgcId: psgc.id,
      region: psgc.region ?? null,
      province: psgc.province ?? null,
      municipality: psgc.mun_city ?? null,
      barangay: psgc.barangay ?? null,
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
         psgc_id = updates.psgc_id,
         region = COALESCE(updates.region, c.region),
         province = COALESCE(updates.province, c.province),
         municipality = COALESCE(updates.municipality, c.municipality),
         barangay = COALESCE(updates.barangay, c.barangay),
         updated_at = NOW()
       FROM (
         VALUES ${valuesSql}
       ) AS updates(client_id, psgc_id, region, province, municipality, barangay)
       WHERE c.id = updates.client_id
         AND c.deleted_at IS NULL`,
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
