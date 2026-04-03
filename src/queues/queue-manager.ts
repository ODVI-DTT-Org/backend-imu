/**
 * Queue Manager
 *
 * Centralized management of all BullMQ queues and workers.
 * Provides singleton access to queues and health checking.
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { logger } from '../utils/logger.js';
import type { JobType, QueueName } from './jobs/job-types.js';

/**
 * Queue configuration
 */
export interface QueueConfig {
  name: QueueName;
  defaultJobOptions?: JobsOptions;
}

/**
 * Queue Manager singleton class
 */
export class QueueManager {
  private static instance: QueueManager;
  private queues: Map<QueueName, Queue> = new Map();
  private workers: Map<QueueName, Worker> = new Map();
  private queueEvents: Map<QueueName, QueueEvents> = new Map();
  private redisUrl: string;

  private constructor() {
    // Default configuration (works without env vars)
    const defaults = {
      redisUrl: 'redis://localhost:6379/0',
      host: 'localhost',
      port: 6379,
      db: 0,
      password: '',
    };

    // Support both REDIS_URL and individual parameters
    // REDIS_URL takes precedence if provided
    const redisUrl = process.env.REDIS_URL || defaults.redisUrl;
    const password = process.env.REDIS_PASSWORD || defaults.password;
    const host = process.env.REDIS_HOST || defaults.host;
    const port = parseInt(process.env.REDIS_PORT || String(defaults.port));
    const db = parseInt(process.env.REDIS_DB || String(defaults.db));

    if (redisUrl !== defaults.redisUrl) {
      // User provided REDIS_URL
      this.redisUrl = redisUrl;
    } else if (password) {
      // User provided individual params with password
      this.redisUrl = `redis://:${password}@${host}:${port}/${db}`;
    } else {
      // Use defaults or individual params without password
      this.redisUrl = `redis://${host}:${port}/${db}`;
    }

    logger.info('QueueManager', `QueueManager initialized with Redis: ${this.maskRedisUrl(this.redisUrl)}`);
  }

  /**
   * Mask sensitive parts of Redis URL for logging
   */
  private maskRedisUrl(url: string): string {
    // Don't log passwords in URLs
    return url.replace(/redis:\/\/:([^@]+)@/, 'redis://:****@/');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  /**
   * Get Redis connection options
   */
  getConnectionOptions() {
    return {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: parseInt(process.env.REDIS_DB || '0'),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 3,
      },
    };
  }

  /**
   * Get Redis connection URL
   */
  getRedisUrl(): string {
    return this.redisUrl;
  }

  /**
   * Get or create a queue
   */
  getQueue(config: QueueConfig): Queue {
    if (this.queues.has(config.name)) {
      return this.queues.get(config.name)!;
    }

    const queue = new Queue(config.name, {
      connection: this.getConnectionOptions().connection,
      defaultJobOptions: config.defaultJobOptions,
    });

    this.queues.set(config.name, queue);

    // Set up queue events for monitoring
    const queueEvents = new QueueEvents(config.name, {
      connection: this.getConnectionOptions().connection,
    });

    queueEvents.on('waiting', ({ jobId }: { jobId: string }) => {
      logger.debug(config.name, `Job ${jobId} is waiting`);
    });

    queueEvents.on('active', ({ jobId }: { jobId: string }) => {
      logger.debug(config.name, `Job ${jobId} is now active`);
    });

    queueEvents.on('completed', ({ jobId }: { jobId: string }) => {
      logger.debug(config.name, `Job ${jobId} completed`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      logger.error(config.name, `Job ${jobId} failed: ${failedReason}`);
    });

    queueEvents.on('progress', ({ jobId, data }: { jobId: string; data: any }) => {
      logger.debug(config.name, `Job ${jobId} progress: ${data?.progress || 0}%`);
    });

    this.queueEvents.set(config.name, queueEvents);

    logger.info('QueueManager', `Queue created: ${config.name}`);

    return queue;
  }

  /**
   * Add a job to a queue
   */
  async addJob<T = any>(
    queueName: QueueName,
    jobName: JobType,
    data: T,
    options?: JobsOptions
  ) {
    const queue = this.getQueue({ name: queueName });

    const job = await queue.add(jobName, data, {
      ...options,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 7 * 24 * 3600, // 7 days
      },
      removeOnFail: {
        age: 30 * 24 * 3600, // 30 days
      },
    });

    logger.info('QueueManager', `Job added to ${queueName}: ${job.id} (${jobName})`);

    return job;
  }

  /**
   * Get a job by ID
   */
  async getJob(queueName: QueueName, jobId: string) {
    const queue = this.getQueue({ name: queueName });
    return await queue.getJob(jobId);
  }

  /**
   * Get job state
   */
  async getJobState(queueName: QueueName, jobId: string) {
    const queue = this.getQueue({ name: queueName });
    return await queue.getJobState(jobId);
  }

  /**
   * Register a worker
   */
  registerWorker(queueName: QueueName, worker: Worker) {
    if (this.workers.has(queueName)) {
      logger.warn('QueueManager', `Worker already registered for queue: ${queueName}`);
      return;
    }

    this.workers.set(queueName, worker);

    worker.on('ready', () => {
      logger.info('QueueManager', `Worker ready for queue: ${queueName}`);
    });

    logger.info('QueueManager', `Worker registered for queue: ${queueName}`);
  }

  /**
   * Get health status of all queues
   */
  async getHealth() {
    const health = {
      status: 'ok' as 'ok' | 'degraded',
      redis: await this.checkRedisConnection(),
      queues: {} as Record<string, any>,
    };

    // Get queue stats
    for (const [name, queue] of this.queues) {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
      health.queues[name] = {
        counts,
        workerRunning: this.workers.has(name),
      };
    }

    // Check if any queue is degraded
    for (const [name, queueHealth] of Object.entries(health.queues)) {
      if (!queueHealth.workerRunning) {
        health.status = 'degraded';
      }
    }

    return health;
  }

  /**
   * Check Redis connection
   */
  private async checkRedisConnection(): Promise<boolean> {
    try {
      const queue = this.getQueue({ name: 'bulk-operations' });
      const client = await queue.client;
      if (client) {
        await client.ping();
        return true;
      }
      return false;
    } catch (error) {
      logger.error('QueueManager', error as Error, 'Redis connection check failed');
      return false;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('QueueManager', 'Shutting down queues...');

    // Close all workers
    for (const [name, worker] of this.workers) {
      try {
        await worker.close();
        logger.info('QueueManager', `Worker closed: ${name}`);
      } catch (error) {
        logger.error('QueueManager', error as Error, `Failed to close worker: ${name}`);
      }
    }

    // Close all queues
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
        logger.info('QueueManager', `Queue closed: ${name}`);
      } catch (error) {
        logger.error('QueueManager', error as Error, `Failed to close queue: ${name}`);
      }
    }

    // Close all queue events
    for (const [name, events] of this.queueEvents) {
      try {
        await events.close();
        logger.info('QueueManager', `QueueEvents closed: ${name}`);
      } catch (error) {
        logger.error('QueueManager', error as Error, `Failed to close QueueEvents: ${name}`);
      }
    }

    this.workers.clear();
    this.queues.clear();
    this.queueEvents.clear();

    logger.info('QueueManager', 'All queues shut down');
  }

  /**
   * Pause a queue (stop processing new jobs)
   */
  async pauseQueue(queueName: QueueName) {
    const queue = this.getQueue({ name: queueName });
    await queue.pause();
    logger.info('QueueManager', `Queue paused: ${queueName}`);
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: QueueName) {
    const queue = this.getQueue({ name: queueName });
    await queue.resume();
    logger.info('QueueManager', `Queue resumed: ${queueName}`);
  }

  /**
   * Obliterate a queue (remove all jobs)
   * USE WITH CAUTION!
   */
  async obliterateQueue(queueName: QueueName) {
    const queue = this.getQueue({ name: queueName });
    await queue.obliterate({ force: true });
    logger.warn('QueueManager', `Queue obliterated: ${queueName}`);
  }
}

/**
 * Export singleton instance getter
 */
export const getQueueManager = () => QueueManager.getInstance();
