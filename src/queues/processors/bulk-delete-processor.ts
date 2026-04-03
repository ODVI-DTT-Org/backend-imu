/**
 * Bulk Delete Processor
 *
 * Handles bulk delete operations for users, groups, caravans, itineraries, etc.
 * Processes deletes in batches with transaction support and progress tracking.
 */

import { Job } from 'bullmq';
import { pool } from '../../db/index.js';
import { BaseProcessor } from '../base-processor.js';
import type { BulkJobData, JobResult } from '../jobs/job-types.js';
import { batchItems, createJobResult, handleJobError } from '../utils/job-helpers.js';

/**
 * Bulk Delete Processor
 */
export class BulkDeleteProcessor extends BaseProcessor<BulkJobData, JobResult> {
  constructor() {
    super('bulk-operations');
  }

  /**
   * Process bulk delete job
   */
  async process(job: Job<BulkJobData>): Promise<JobResult> {
    const { type, userId, items, params } = job.data;
    const startedAt = new Date();

    // Validate job data
    if (!items || items.length === 0) {
      throw new Error('No items to delete');
    }

    // Determine table based on job type
    const table = this.getTableForType(type);
    const idColumn = this.getIdColumnForType(type);

    // Process in batches
    const batchSize = 50;
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

      // Process batch
      const batchResult = await this.processBatch(batch, table, idColumn);

      succeeded.push(...batchResult.succeeded);
      failed.push(...batchResult.failed);
    }

    return createJobResult(items.length, succeeded, failed, startedAt, {
      deleted: succeeded.length,
      table,
    });
  }

  /**
   * Process a batch of deletes
   */
  private async processBatch(
    ids: string[],
    table: string,
    idColumn: string
  ): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const id of ids) {
        try {
          // Check if record exists
          const checkResult = await client.query(
            `SELECT 1 FROM ${table} WHERE ${idColumn} = $1`,
            [id]
          );

          if (checkResult.rows.length === 0) {
            failed.push({
              id,
              error: `Record not found in ${table}`,
            });
            continue;
          }

          // Delete record
          await client.query(
            `DELETE FROM ${table} WHERE ${idColumn} = $1`,
            [id]
          );

          succeeded.push(id);
        } catch (error) {
          failed.push({
            id,
            error: handleJobError(error, id, { table }),
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
   * Get table name for job type
   */
  private getTableForType(type: string): string {
    const tableMap: Record<string, string> = {
      bulk_delete_users: 'users',
      bulk_delete_groups: 'groups',
      bulk_delete_caravans: 'caravans',
      bulk_delete_itineraries: 'itineraries',
      bulk_delete_clients: 'clients',
      bulk_delete_touchpoints: 'touchpoints',
    };

    const table = tableMap[type];
    if (!table) {
      throw new Error(`Unknown job type: ${type}`);
    }

    return table;
  }

  /**
   * Get ID column for table
   */
  private getIdColumnForType(type: string): string {
    return 'id'; // All tables use 'id' as primary key
  }

  /**
   * Override concurrency for bulk deletes
   */
  protected getConcurrency(): number {
    return parseInt(process.env.QUEUE_CONCURRENCY_BULK_OPERATIONS || '5');
  }
}

/**
 * Export singleton instance getter
 */
export const bulkDeleteProcessor = new BulkDeleteProcessor();
