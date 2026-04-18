/**
 * Base Processor Class
 *
 * Abstract base class for all BullMQ job processors.
 * Provides common functionality for progress tracking, error handling, and logging.
 */

import { Job, Worker } from 'bullmq';
import { logger } from '../utils/logger.js';
import type { JobProgress, JobResult } from './jobs/job-types.js';

/**
 * Abstract processor class that all queue processors should extend
 */
export abstract class BaseProcessor<T = any, R = any> {
  protected worker: Worker<T, R> | null = null;
  protected queueName: string;

  constructor(queueName: string) {
    this.queueName = queueName;
  }

  /**
   * Get the processor function for BullMQ
   */
  abstract process(job: Job<T>): Promise<R>;

  /**
   * Get queue options for this processor
   */
  getQueueOptions() {
    return {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: parseInt(process.env.REDIS_DB || '0'),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 3) return null;
          return Math.min(times * 100, 500);
        },
      },
      concurrency: this.getConcurrency(),
    };
  }

  /**
   * Get concurrency level for this processor
   * Override in subclass for custom concurrency
   */
  protected getConcurrency(): number {
    return 5; // Default concurrency
  }

  /**
   * Get rate limiter options (optional)
   * Override in subclass to enable rate limiting
   */
  protected getRateLimiter() {
    return undefined;
  }

  /**
   * Update job progress
   */
  protected async updateProgress(job: Job<T>, progress: JobProgress): Promise<void> {
    await job.updateProgress(progress.progress);
    await job.log(JSON.stringify(progress));
  }

  /**
   * Log job start
   */
  protected logJobStart(job: Job<T>): void {
    const userId = (job.data as any)?.userId || 'unknown';
    logger.info('QueueProcessor', `Job started: ${job.id} (${job.name}) for user: ${userId}`);
  }

  /**
   * Log job completion
   */
  protected logJobComplete(job: Job<T>, result: R): void {
    logger.info('QueueProcessor', `Job completed: ${job.id} (${job.name})`);
  }

  /**
   * Log job error
   */
  protected logJobError(job: Job<T>, error: Error): void {
    logger.error('QueueProcessor', error, `Job failed: ${job.id} (${job.name})`);
  }

  /**
   * Process job with error handling and logging
   */
  protected async processJob(job: Job<T>): Promise<R> {
    this.logJobStart(job);

    try {
      const result = await this.process(job);
      this.logJobComplete(job, result);
      return result;
    } catch (error) {
      this.logJobError(job, error as Error);
      throw error;
    }
  }

  /**
   * Start the worker
   */
  start(): Worker<T, R> {
    if (this.worker) {
      logger.warn(this.queueName, 'Worker already started');
      return this.worker;
    }

    const options = this.getQueueOptions();
    const rateLimiter = this.getRateLimiter();

    this.worker = new Worker<T, R>(
      this.queueName,
      async (job: Job<T>) => this.processJob(job),
      {
        ...options,
        ...(rateLimiter ? { limiter: rateLimiter } : {}),
      }
    );

    // Set up event listeners
    this.worker.on('completed', (job: Job<T>, result: R) => {
      logger.info('QueueProcessor', `Worker job completed: ${job.id}`);
    });

    this.worker.on('failed', (job: Job<T> | undefined, error: Error) => {
      logger.error('QueueProcessor', error, `Worker job failed: ${job?.id}`);
    });

    this.worker.on('error', (error: Error) => {
      logger.error('QueueProcessor', error, 'Worker error');
    });

    // Removed verbose startup log - now handled by init-logger

    return this.worker;
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (!this.worker) {
      logger.warn('QueueProcessor', 'Worker not running');
      return;
    }

    await this.worker.close();
    this.worker = null;

    logger.info('QueueProcessor', `Worker stopped for queue: ${this.queueName}`);
  }

  /**
   * Get worker instance
   */
  getWorker(): Worker<T, R> | null {
    return this.worker;
  }

  /**
   * Check if worker is running
   */
  isRunning(): boolean {
    return this.worker !== null;
  }
}
