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
      throw new Error('No items to process');
    }

    // Process in batches
    const batchSize = 20;
    const batches = batchItems(items, batchSize);

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      // Update progress
      await this.updateProgress(job, {
        progress: Math.floor((i / batches.length) * 100),
        total: items.length,
        current: succeeded.length + failed.length,
        message: `Processing batch ${i + 1} of ${batches.length}`,
        succeeded,
        failed,
      });

      // Process batch with transaction
      const batchResult = await this.processBatch(batch, type, userId, params);
      succeeded.push(...batchResult.succeeded);
      failed.push(...batchResult.failed);
    }

    return createJobResult(items.length, succeeded, failed, startedAt, {
      operation: type,
      processed: 'assigned',
    });
  }

  /**
   * Process a batch of location assignments with transaction
   */
  private async processBatch(
    ids: string[],
    operation: string,
    userId: string,
    params?: Record<string, any>
  ): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const id of ids) {
        try {
          switch (operation) {
            case 'psgc_matching':
              await this.processPsgcMatching(client, id);
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
          failed.push({
            id,
            error: handleJobError(error, id, { operation }),
          });
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { succeeded, failed };
  }

  /**
   * Process PSGC matching for a client
   */
  private async processPsgcMatching(client: any, clientId: string): Promise<void> {
    // Get client information
    const clientResult = await client.query(
      'SELECT municipality, province FROM clients WHERE id = $1',
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      throw new Error('Client not found');
    }

    const clientData = clientResult.rows[0];

    // Find matching PSGC record
    const psgcResult = await client.query(
      `SELECT code, municipality, province FROM psgc
       WHERE LOWER(municipality) = LOWER($1)
       AND LOWER(province) = LOWER($2)
       LIMIT 1`,
      [clientData.municipality, clientData.province]
    );

    if (psgcResult.rows.length === 0) {
      throw new Error('No matching PSGC record found');
    }

    const psgcData = psgcResult.rows[0];

    // Update client with PSGC code
    await client.query(
      'UPDATE clients SET psgc_code = $1, updated_at = NOW() WHERE id = $2',
      [psgcData.code, clientId]
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
