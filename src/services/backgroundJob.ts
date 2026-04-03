/**
 * Background Job Service
 *
 * Manages long-running operations like PSGC matching and report generation.
 * Uses PostgreSQL for job state management.
 */

import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';

export type JobType = 'psgc_matching' | 'report_generation' | 'user_location_assignment';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface BackgroundJob {
  id: string;
  type: JobType;
  status: JobStatus;
  params: Record<string, any>;
  result?: Record<string, any>;
  error?: string;
  progress: number;
  total_items: number;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
  created_by?: string;
}

export interface CreateJobParams {
  type: JobType;
  params: Record<string, any>;
  total_items?: number;
  created_by?: string;
}

export interface UpdateJobParams {
  status?: JobStatus;
  result?: Record<string, any>;
  error?: string;
  progress?: number;
  started_at?: Date;
  completed_at?: Date;
}

/**
 * Create a new background job
 */
export async function createJob(params: CreateJobParams): Promise<BackgroundJob> {
  const { type, params: jobParams, total_items = 0, created_by } = params;

  const result = await pool.query(
    `INSERT INTO background_jobs (type, status, params, total_items, created_by)
     VALUES ($1, 'pending', $2, $3, $4)
     RETURNING *`,
    [type, JSON.stringify(jobParams), total_items, created_by]
  );

  logger.info('background-job', `Created job ${result.rows[0].id} of type ${type}`);

  return result.rows[0];
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<BackgroundJob | null> {
  try {
    const result = await pool.query(
      'SELECT * FROM background_jobs WHERE id = $1',
      [jobId]
    );

    return result.rows[0] || null;
  } catch (error: any) {
    // Handle case where table doesn't exist yet
    if (error.code === '42P01') {
      return null;
    }
    throw error;
  }
}

/**
 * Update job status and progress
 */
export async function updateJob(jobId: string, params: UpdateJobParams): Promise<BackgroundJob | null> {
  try {
    const { status, result, error, progress, started_at, completed_at } = params;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (result !== undefined) {
      updates.push(`result = $${paramIndex++}`);
      values.push(JSON.stringify(result));
    }

    if (error !== undefined) {
      updates.push(`error = $${paramIndex++}`);
      values.push(error);
    }

    if (progress !== undefined) {
      updates.push(`progress = $${paramIndex++}`);
      values.push(progress);
    }

    if (started_at !== undefined) {
      updates.push(`started_at = $${paramIndex++}`);
      values.push(started_at);
    }

    if (completed_at !== undefined) {
      updates.push(`completed_at = $${paramIndex++}`);
      values.push(completed_at);
    }

    if (updates.length === 0) {
      return await getJob(jobId);
    }

    values.push(jobId);

    const queryResult = await pool.query(
      `UPDATE background_jobs
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return queryResult.rows[0] || null;
  } catch (dbError: any) {
    // Handle case where table doesn't exist yet
    if (dbError.code === '42P01') {
      logger.warn('background-job', 'background_jobs table does not exist yet - migration not run');
      return null;
    }
    throw dbError;
  }
}

/**
 * Get pending jobs
 */
export async function getPendingJobs(type?: JobType, limit: number = 10): Promise<BackgroundJob[]> {
  try {
    const query = type
      ? 'SELECT * FROM background_jobs WHERE status = $1 AND type = $2 ORDER BY created_at ASC LIMIT $3'
      : 'SELECT * FROM background_jobs WHERE status = $1 ORDER BY created_at ASC LIMIT $2';

    const params = type
      ? ['pending', type, limit]
      : ['pending', limit];

    const result = await pool.query(query, params);

    return result.rows;
  } catch (error: any) {
    // Handle case where table doesn't exist yet (migration not run)
    if (error.code === '42P01') {
      // Table doesn't exist, return empty array
      return [];
    }
    throw error;
  }
}

/**
 * Mark job as processing and start it
 */
export async function startJob(jobId: string): Promise<BackgroundJob | null> {
  return await updateJob(jobId, {
    status: 'processing',
    started_at: new Date(),
  });
}

/**
 * Mark job as completed with result
 */
export async function completeJob(jobId: string, result: Record<string, any>): Promise<BackgroundJob | null> {
  const job = await updateJob(jobId, {
    status: 'completed',
    result,
    progress: 100,
    completed_at: new Date(),
  });

  if (job) {
    logger.info('background-job', `Completed job ${jobId} of type ${job.type}`);
  }

  return job;
}

/**
 * Mark job as failed with error
 */
export async function failJob(jobId: string, error: string): Promise<BackgroundJob | null> {
  const job = await updateJob(jobId, {
    status: 'failed',
    error,
    completed_at: new Date(),
  });

  if (job) {
    logger.error('background-job', `Failed job ${jobId} of type ${job.type}: ${error}`);
  }

  return job;
}

/**
 * Update job progress
 */
export async function updateProgress(jobId: string, progress: number): Promise<BackgroundJob | null> {
  return await updateJob(jobId, { progress });
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<BackgroundJob | null> {
  return await updateJob(jobId, {
    status: 'cancelled',
    completed_at: new Date(),
  });
}

/**
 * Get jobs for a user
 */
export async function getJobsForUser(userId: string, type?: JobType, limit: number = 20): Promise<BackgroundJob[]> {
  try {
    const query = type
      ? `SELECT * FROM background_jobs
         WHERE created_by = $1 AND type = $2
         ORDER BY created_at DESC
         LIMIT $3`
      : `SELECT * FROM background_jobs
         WHERE created_by = $1
         ORDER BY created_at DESC
         LIMIT $2`;

    const params = type
      ? [userId, type, limit]
      : [userId, limit];

    const result = await pool.query(query, params);

    return result.rows;
  } catch (error: any) {
    // Handle case where table doesn't exist yet
    if (error.code === '42P01') {
      return [];
    }
    throw error;
  }
}

/**
 * Clean up old completed jobs (older than specified days)
 */
export async function cleanupOldJobs(daysToKeep: number = 7): Promise<number> {
  try {
    const result = await pool.query(
      `DELETE FROM background_jobs
       WHERE status IN ('completed', 'failed', 'cancelled')
         AND completed_at < NOW() - INTERVAL '${daysToKeep} days'
       RETURNING id`
    );

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info('background-job', `Cleaned up ${deletedCount} old jobs`);
    }

    return deletedCount;
  } catch (error: any) {
    // Handle case where table doesn't exist yet
    if (error.code === '42P01') {
      return 0;
    }
    throw error;
  }
}

/**
 * Job processor interface
 */
export interface JobProcessor {
  type: JobType;
  process: (job: BackgroundJob) => Promise<Record<string, any>>;
}

/**
 * Process pending jobs
 */
export async function processJobs(processors: JobProcessor[]): Promise<void> {
  const pendingJobs = await getPendingJobs();

  for (const job of pendingJobs) {
    const processor = processors.find(p => p.type === job.type);

    if (!processor) {
      logger.warn('background-job', `No processor found for job type ${job.type}`);
      await failJob(job.id, `No processor found for job type ${job.type}`);
      continue;
    }

    try {
      await startJob(job.id);

      logger.info('background-job', `Processing job ${job.id} of type ${job.type}`);

      const result = await processor.process(job);

      await completeJob(job.id, result);
    } catch (error: any) {
      await failJob(job.id, error.message || 'Unknown error');
    }
  }
}

/**
 * Start job processor (runs in background with setInterval)
 */
export function startJobProcessor(processors: JobProcessor[], intervalMs: number = 5000): NodeJS.Timeout {
  logger.info('background-job', `Starting job processor (interval: ${intervalMs}ms)`);

  return setInterval(async () => {
    await processJobs(processors);
  }, intervalMs);
}
