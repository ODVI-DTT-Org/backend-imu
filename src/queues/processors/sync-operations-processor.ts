/**
 * Sync Operations Processor
 *
 * Handles PowerSync batch operations from mobile app:
 * - Bulk put operations
 * - Bulk delete operations
 * - Bulk patch operations
 */

import { Job } from 'bullmq';
import { pool } from '../../db/index.js';
import { BaseProcessor } from '../base-processor.js';
import type { SyncJobData, JobResult } from '../jobs/job-types.js';
import { logger } from '../../utils/logger.js';

/**
 * Sync Operations Processor
 */
export class SyncOperationsProcessor extends BaseProcessor<SyncJobData, JobResult> {
  constructor() {
    super('sync-operations');
  }

  /**
   * Process sync operation job
   */
  async process(job: Job<SyncJobData>): Promise<JobResult> {
    const { type, userId, requestId, operations } = job.data;
    const startedAt = new Date();

    // Validate job data
    if (!operations || operations.length === 0) {
      throw new Error('No operations to process');
    }

    // Update progress
    await this.updateProgress(job, {
      progress: 10,
      total: operations.length,
      current: 0,
      message: 'Starting sync operations...',
    });

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    // Process operations in transaction
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];

        // Update progress
        if (i % 10 === 0) {
          await this.updateProgress(job, {
            progress: Math.floor((i / operations.length) * 100),
            total: operations.length,
            current: i,
            message: `Processing operation ${i + 1} of ${operations.length}`,
            succeeded,
            failed,
          });
        }

        try {
          await this.processOperation(client, operation, userId);
          succeeded.push(`${operation.type}:${operation.table}:${i}`);
        } catch (error: any) {
          logger.error('SyncOperationsProcessor', `Operation failed: ${operation.type} on ${operation.table}`, error);
          failed.push({
            id: `${operation.type}:${operation.table}:${i}`,
            error: error.message || 'Operation failed',
          });
        }
      }

      await client.query('COMMIT');

      await this.updateProgress(job, {
        progress: 100,
        total: operations.length,
        current: operations.length,
        message: 'Sync operations complete',
        succeeded,
        failed,
      });

      return {
        success: true,
        total: operations.length,
        succeeded,
        failed,
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        result: {
          requestId,
          operationCount: operations.length,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process a single sync operation
   */
  private async processOperation(
    client: any,
    operation: { type: 'put' | 'delete' | 'patch'; table: string; data: any },
    userId: string
  ): Promise<void> {
    const { type, table, data } = operation;

    // Validate table name to prevent SQL injection
    const validTables = [
      'clients',
      'touchpoints',
      'itineraries',
      'users',
      'attendance',
      'approvals',
    ];

    if (!validTables.includes(table)) {
      throw new Error(`Invalid table: ${table}`);
    }

    switch (type) {
      case 'put':
        await this.processPutOperation(client, table, data, userId);
        break;
      case 'delete':
        await this.processDeleteOperation(client, table, data, userId);
        break;
      case 'patch':
        await this.processPatchOperation(client, table, data, userId);
        break;
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }

  /**
   * Process put operation (insert or update)
   */
  private async processPutOperation(client: any, table: string, data: any, userId: string): Promise<void> {
    const { id, ...dataWithoutId } = data;

    // Refuse to resurrect tombstoned itineraries — a web admin or the
    // owner already deleted this row, and the mobile cache shouldn't
    // override that.
    // Check both the exact UUID and the composite (user+client+date) key so
    // resurrection-with-a-new-UUID is also blocked.
    if (table === 'itineraries') {
      const tombstoneById = await client.query(
        `SELECT 1 FROM deleted_itineraries WHERE id = $1`,
        [id]
      );
      if (tombstoneById.rows.length > 0) {
        console.log(`[Sync] Skipping put for tombstoned itinerary ${id} (UUID match)`);
        return;
      }

      // Composite check: block if (user_id, client_id, scheduled_date) was deleted.
      const userId = dataWithoutId.user_id;
      const clientId = dataWithoutId.client_id;
      const scheduledDate = dataWithoutId.scheduled_date;
      if (userId && clientId && scheduledDate) {
        const tombstoneByComposite = await client.query(
          `SELECT 1 FROM deleted_itineraries
           WHERE user_id = $1 AND client_id = $2 AND scheduled_date = $3::date
           LIMIT 1`,
          [userId, clientId, scheduledDate]
        );
        if (tombstoneByComposite.rows.length > 0) {
          console.log(`[Sync] Skipping put for tombstoned itinerary ${id} (composite match: user=${userId} client=${clientId} date=${scheduledDate})`);
          return;
        }
      }
    }

    // Check if record exists
    const existingResult = await client.query(
      `SELECT id FROM ${table} WHERE id = $1`,
      [id]
    );

    if (existingResult.rows.length > 0) {
      // Update existing record
      const updateFields = Object.keys(dataWithoutId);
      const updateValues = Object.values(dataWithoutId);
      const setClause = updateFields
        .map((field, index) => `${field} = $${index + 2}`)
        .join(', ');

      await client.query(
        `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $1`,
        [id, ...updateValues]
      );
    } else {
      // Insert new record
      const fields = ['id', ...Object.keys(dataWithoutId)];
      const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
      const values = [id, ...Object.values(dataWithoutId)];

      await client.query(
        `INSERT INTO ${table} (${fields.join(', ')}, created_at, updated_at)
         VALUES (${placeholders}, NOW(), NOW())`,
        values
      );
    }
  }

  /**
   * Process delete operation
   */
  private async processDeleteOperation(client: any, table: string, data: any, userId: string): Promise<void> {
    const { id } = data;

    // Check if record exists
    const existingResult = await client.query(
      `SELECT id FROM ${table} WHERE id = $1`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw new Error(`Record not found: ${id}`);
    }

    // Delete record
    await client.query(
      `DELETE FROM ${table} WHERE id = $1`,
      [id]
    );
  }

  /**
   * Process patch operation (partial update)
   */
  private async processPatchOperation(client: any, table: string, data: any, userId: string): Promise<void> {
    const { id, ...patchData } = data;

    // Check if record exists
    const existingResult = await client.query(
      `SELECT id FROM ${table} WHERE id = $1`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw new Error(`Record not found: ${id}`);
    }

    // Update record with partial data
    const updateFields = Object.keys(patchData);
    const updateValues = Object.values(patchData);
    const setClause = updateFields
      .map((field, index) => `${field} = $${index + 2}`)
      .join(', ');

    await client.query(
      `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $1`,
      [id, ...updateValues]
    );
  }

  /**
   * Override concurrency for sync operations
   */
  protected getConcurrency(): number {
    return parseInt(process.env.QUEUE_CONCURRENCY_SYNC_OPERATIONS || '10');
  }
}

/**
 * Export singleton instance getter
 */
export const syncOperationsProcessor = new SyncOperationsProcessor();
