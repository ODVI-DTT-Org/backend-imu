/**
 * Job Helper Utilities
 *
 * Common utility functions for working with BullMQ jobs.
 */

import { getQueueManager } from '../queue-manager.js';
import type { BulkJobData, ReportJobData, SyncJobData, JobResult } from '../jobs/job-types.js';
import { SyncJobType } from '../jobs/job-types.js';
import type { JobsOptions } from 'bullmq';
import { logger } from '../../utils/logger.js';

/**
 * Add a bulk operation job to the queue
 */
export async function addBulkJob(
  type: BulkJobData['type'],
  userId: string,
  items: string[],
  params?: Record<string, any>,
  options?: JobsOptions
) {
  const queueManager = getQueueManager();

  const data: BulkJobData = {
    userId,
    type,
    items,
    params,
  };

  const job = await queueManager.addJob(
    'bulk-operations',
    type,
    data,
    options
  );

  return job;
}

/**
 * Add a report generation job to the queue
 */
export async function addReportJob(
  type: ReportJobData['type'],
  userId: string,
  params?: ReportJobData['params'],
  options?: JobsOptions
) {
  const queueManager = getQueueManager();

  const data: ReportJobData = {
    userId,
    type,
    reportType: type,
    params,
  };

  const job = await queueManager.addJob(
    'reports',
    type,
    data,
    options
  );

  return job;
}

/**
 * Add a location assignment job to the queue
 */
export async function addLocationJob(
  type: BulkJobData['type'],
  userId: string,
  items: string[],
  params?: Record<string, any>,
  options?: JobsOptions
) {
  const queueManager = getQueueManager();

  const data: BulkJobData = {
    userId,
    type,
    items,
    params,
  };

  const job = await queueManager.addJob(
    'location-assignments',
    type,
    data,
    options
  );

  return job;
}

/**
 * Add a sync operation job to the queue
 */
export async function addSyncJob(
  userId: string,
  operations: SyncJobData['operations'],
  options?: JobsOptions
) {
  const queueManager = getQueueManager();

  const data: SyncJobData = {
    userId,
    type: SyncJobType.POWERSYNC_BATCH,
    operations,
  };

  const job = await queueManager.addJob(
    'sync-operations',
    SyncJobType.POWERSYNC_BATCH,
    data,
    {
      ...options,
      priority: 10, // High priority for sync operations
    }
  );

  return job;
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string) {
  // Try to find the job in all queues
  const queueManager = getQueueManager();
  const queues = ['bulk-operations', 'reports', 'location-assignments', 'sync-operations'] as const;

  for (const queueName of queues) {
    try {
      const job = await queueManager.getJob(queueName, jobId);
      if (job) {
        return {
          job,
          queueName,
        };
      }
    } catch (error) {
      // Job not in this queue, continue
      continue;
    }
  }

  return null;
}

/**
 * Get job status and progress
 */
export async function getJobStatus(jobId: string) {
  const jobData = await getJob(jobId);

  if (!jobData) {
    return null;
  }

  const { job, queueName } = jobData;
  const state = await job.getState();

  return {
    id: job.id,
    name: job.name,
    queueName,
    state,
    progress: job.progress,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    attemptsMade: job.attemptsMade,
  };
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string) {
  const jobData = await getJob(jobId);

  if (!jobData) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const { job } = jobData;
  await job.remove();

  logger.info('JobHelpers', `Job cancelled: ${jobId}`);

  return { success: true, jobId };
}

/**
 * Create a job result object
 */
export function createJobResult(
  total: number,
  succeeded: string[],
  failed: Array<{ id: string; error: string }>,
  startedAt: Date,
  result?: any
): JobResult {
  return {
    success: failed.length === 0,
    total,
    succeeded,
    failed,
    startedAt,
    completedAt: new Date(),
    duration: Date.now() - startedAt.getTime(),
    result,
  };
}

/**
 * Calculate estimated completion time based on progress
 */
export function estimateCompletionTime(
  startedAt: Date,
  currentProgress: number,
  totalItems: number
): Date {
  if (currentProgress <= 0 || totalItems <= 0) {
    return new Date(Date.now() + 60000); // Default: 1 minute from now
  }

  const elapsed = Date.now() - startedAt.getTime();
  const itemsPerMs = currentProgress / elapsed;
  const remainingItems = totalItems - currentProgress;
  const estimatedRemainingMs = remainingItems / itemsPerMs;

  return new Date(Date.now() + estimatedRemainingMs);
}

/**
 * Format job duration for display
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Validate job data
 */
export function validateJobData(data: any): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }

  if (!data.userId || typeof data.userId !== 'string') {
    return false;
  }

  return true;
}

/**
 * Create job options with priority
 */
export function createJobOptions(priority: number = 5): JobsOptions {
  return {
    priority,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  };
}

/**
 * Batch items into chunks
 */
export function batchItems<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Process items with progress tracking
 */
export async function processItemsWithProgress<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  onProgress?: (current: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i++) {
    const result = await processor(items[i], i);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, items.length);
    }
  }

  return results;
}

/**
 * Handle job error with retry logic
 */
export function handleJobError(error: any, item: any, context: any = {}): string {
  const errorMessage = error?.message || String(error);

  logger.error('JobHelpers', error, {
    message: 'Job item processing failed',
    item,
    context,
  });

  return errorMessage;
}
