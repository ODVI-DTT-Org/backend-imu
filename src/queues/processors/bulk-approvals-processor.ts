/**
 * Bulk Approvals Processor
 *
 * Handles bulk approve and reject operations for approval requests.
 * Processes approvals in batches with transaction support and client edit handling.
 */

import { Job } from 'bullmq';
import { pool } from '../../db/index.js';
import { BaseProcessor } from '../base-processor.js';
import type { BulkJobData, JobResult } from '../jobs/job-types.js';
import { batchItems, createJobResult, handleJobError } from '../utils/job-helpers.js';
import { logger } from '../../utils/logger.js';

/**
 * Bulk Approvals Processor
 */
export class BulkApprovalsProcessor extends BaseProcessor<BulkJobData, JobResult> {
  constructor() {
    super('bulk-operations');
  }

  /**
   * Process bulk approval job
   */
  async process(job: Job<BulkJobData>): Promise<JobResult> {
    const { type, userId, items, params } = job.data;
    const startedAt = new Date();

    // Validate job data
    if (!items || items.length === 0) {
      throw new Error('No items to process');
    }

    // Determine operation type (approve or reject)
    const operation = type.replace('bulk_', '') as 'approve' | 'reject'; // 'approve' or 'reject'

    // Process in batches
    const batchSize = 10;
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
      const batchResult = await this.processBatch(batch, operation, userId, params);
      succeeded.push(...batchResult.succeeded);
      failed.push(...batchResult.failed);
    }

    return createJobResult(items.length, succeeded, failed, startedAt, {
      operation,
      processed: operation === 'approve' ? 'approved' : 'rejected',
    });
  }

  /**
   * Process a batch of approvals with transaction
   */
  private async processBatch(
    ids: string[],
    operation: 'approve' | 'reject',
    userId: string,
    params?: Record<string, any>
  ): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const id of ids) {
        let approval: Record<string, any> | null = null;

        try {
          // Check if approval exists and is pending
          const existing = await client.query(
            'SELECT * FROM approvals WHERE id = $1',
            [id]
          );

          if (existing.rows.length === 0) {
            // Handle 404 as success (not failed)
            succeeded.push(id);
            continue;
          }

          approval = existing.rows[0];

          if (approval!.status !== 'pending') {
            failed.push({ id, error: 'Approval is not in pending status' });
            continue;
          }

          // For client edit approvals with approve operation, apply the changes to the client
          if (operation === 'approve' && approval!.type === 'client' && approval!.reason === 'Client Edit Request') {
            try {
              const changes = JSON.parse(approval!.notes || '{}');

              // Build dynamic update query
              const updateFields: string[] = [];
              const updateValues: any[] = [];
              let paramIndex = 1;

              const fieldMappings: Record<string, string> = {
                first_name: 'first_name',
                last_name: 'last_name',
                middle_name: 'middle_name',
                birth_date: 'birth_date',
                email: 'email',
                phone: 'phone',
                agency_name: 'agency_name',
                department: 'department',
                position: 'position',
                employment_status: 'employment_status',
                payroll_date: 'payroll_date',
                tenure: 'tenure',
                client_type: 'client_type',
                product_type: 'product_type',
                market_type: 'market_type',
                pension_type: 'pension_type',
                pan: 'pan',
                facebook_link: 'facebook_link',
                remarks: 'remarks',
                agency_id: 'agency_id',
                caravan_id: 'caravan_id',
                is_starred: 'is_starred',
              };

              for (const [key, dbField] of Object.entries(fieldMappings)) {
                if (key in changes && changes[key] !== undefined) {
                  updateFields.push(`${dbField} = $${paramIndex}`);
                  updateValues.push(changes[key]);
                  paramIndex++;
                }
              }

              if (updateFields.length > 0) {
                updateValues.push(approval!.client_id);
                await client.query(
                  `UPDATE clients SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
                  updateValues
                );
              }
            } catch (parseError) {
              logger.error('BulkApprovalsProcessor', 'Failed to parse client edit changes', parseError);
            }
          }

          // Update approval status
          const status = operation === 'approve' ? 'approved' : 'rejected';
          await client.query(
            `UPDATE approvals
             SET status = $1,
                 ${operation === 'approve' ? 'approved_by' : 'rejected_by'} = $2,
                 ${operation === 'approve' ? 'approved_at' : 'rejected_at'} = NOW(),
                 updated_at = NOW()
             WHERE id = $3`,
            [status, userId, id]
          );

          succeeded.push(id);
        } catch (error: any) {
          failed.push({
            id,
            error: handleJobError(error, id, { operation, approval }),
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
   * Override concurrency for approvals
   */
  protected getConcurrency(): number {
    return parseInt(process.env.QUEUE_CONCURRENCY_BULK_OPERATIONS || '5');
  }
}

/**
 * Export singleton instance getter
 */
export const bulkApprovalsProcessor = new BulkApprovalsProcessor();
