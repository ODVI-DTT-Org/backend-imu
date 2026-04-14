/**
 * Cron Job Scheduler
 * Manages scheduled tasks for the IMU system
 *
 * This service sets up and manages cron jobs for periodic tasks like
 * refreshing materialized views, sending notifications, and cleanup operations.
 */

import cron from 'node-cron';
import { refreshActionItemsView } from './actionItemsRefreshService.js';
import { warmAllAssignedClientsCache } from './cache-warming.js';
import { refreshTouchpointSummaryMV, refreshAllMaterializedViews } from './touchpoint-mv-refresh.js';
import { logger } from '../utils/logger.js';

/**
 * Scheduled tasks configuration
 */
const SCHEDULED_TASKS = {
  // Refresh action items view every hour
  actionItemsRefresh: {
    schedule: '0 * * * *', // Every hour at minute 0
    description: 'Refresh action_items materialized view',
    task: 'actionItemsRefresh',
  },
  // Refresh touchpoint summary materialized view every 5 minutes
  touchpointMVRefresh: {
    schedule: '*/5 * * * *', // Every 5 minutes
    description: 'Refresh all client-related materialized views (touchpoint_summary + callable_clients)',
    task: 'touchpointMVRefresh',
  },
  // Warm assigned clients cache daily at 6 AM
  cacheWarming: {
    schedule: '0 6 * * *', // Daily at 6:00 AM
    description: 'Warm assigned clients cache for all Caravan/Tele users',
    task: 'cacheWarming',
  },
};

/**
 * Active cron jobs registry
 */
const activeJobs = new Map<string, cron.ScheduledTask>();

/**
 * Start the cron job scheduler
 *
 * This function starts all scheduled tasks. It should be called when
 * the application starts up.
 */
export function startScheduler(): void {
  logger.info('scheduler', 'Starting cron job scheduler');

  // Start action items refresh job
  startActionItemsRefreshJob();

  // Start touchpoint MV refresh job
  startTouchpointMVRefreshJob();

  // Start cache warming job
  startCacheWarmingJob();

  logger.info('scheduler', 'Cron job scheduler started successfully', {
    activeJobs: Array.from(activeJobs.keys()),
  });
}

/**
 * Stop the cron job scheduler
 *
 * This function stops all scheduled tasks. It should be called when
 * the application is shutting down.
 */
export function stopScheduler(): void {
  logger.info('scheduler', 'Stopping cron job scheduler');

  // Stop all active jobs
  activeJobs.forEach((job, name) => {
    job.stop();
    logger.info('scheduler', `Stopped cron job: ${name}`);
  });

  activeJobs.clear();

  logger.info('scheduler', 'Cron job scheduler stopped');
}

/**
 * Start the action items refresh job
 */
function startActionItemsRefreshJob(): void {
  const task = SCHEDULED_TASKS.actionItemsRefresh;

  logger.info('scheduler', `Starting scheduled task: ${task.task}`, {
    schedule: task.schedule,
    description: task.description,
  });

  // Create and start the cron job
  const job = cron.schedule(task.schedule, async () => {
    try {
      logger.info('scheduler', `Executing scheduled task: ${task.task}`);
      await refreshActionItemsView();
      logger.info('scheduler', `Successfully executed scheduled task: ${task.task}`);
    } catch (error: any) {
      logger.error('scheduler', `Failed to execute scheduled task: ${task.task}`, {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  // Register the active job
  activeJobs.set(task.task, job);

  logger.info('scheduler', `Started cron job: ${task.task}`, {
    schedule: task.schedule,
  });
}

/**
 * Start the touchpoint materialized view refresh job
 */
function startTouchpointMVRefreshJob(): void {
  const task = SCHEDULED_TASKS.touchpointMVRefresh;

  logger.info('scheduler', `Starting scheduled task: ${task.task}`, {
    schedule: task.schedule,
    description: task.description,
  });

  // Create and start the cron job
  const job = cron.schedule(task.schedule, async () => {
    try {
      logger.info('scheduler', `Executing scheduled task: ${task.task}`);
      const stats = await refreshAllMaterializedViews();
      logger.info('scheduler', `Successfully executed scheduled task: ${task.task}`, {
        stats: {
          touchpoint_summary: stats.touchpoint_summary.row_count,
          callable_clients: stats.callable_clients.row_count,
          total_duration_ms: stats.touchpoint_summary.duration_ms + stats.callable_clients.duration_ms,
        },
      });
    } catch (error: any) {
      logger.error('scheduler', `Failed to execute scheduled task: ${task.task}`, {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  // Register the active job
  activeJobs.set(task.task, job);

  logger.info('scheduler', `Started cron job: ${task.task}`, {
    schedule: task.schedule,
  });
}

/**
 * Start the cache warming job
 */
function startCacheWarmingJob(): void {
  const task = SCHEDULED_TASKS.cacheWarming;

  logger.info('scheduler', `Starting scheduled task: ${task.task}`, {
    schedule: task.schedule,
    description: task.description,
  });

  // Create and start the cron job
  const job = cron.schedule(task.schedule, async () => {
    try {
      logger.info('scheduler', `Executing scheduled task: ${task.task}`);
      const stats = await warmAllAssignedClientsCache();
      logger.info('scheduler', `Successfully executed scheduled task: ${task.task}`, {
        stats: {
          total_users: stats.total_users,
          successful_warms: stats.successful_warms,
          total_client_ids_cached: stats.total_client_ids_cached,
          duration_ms: stats.duration_ms,
        },
      });
    } catch (error: any) {
      logger.error('scheduler', `Failed to execute scheduled task: ${task.task}`, {
        error: error.message,
        stack: error.stack,
      });
    }
  });

  // Register the active job
  activeJobs.set(task.task, job);

  logger.info('scheduler', `Started cron job: ${task.task}`, {
    schedule: task.schedule,
  });
}

/**
 * Get scheduler status
 *
 * Returns information about the scheduler and its active jobs.
 */
export function getSchedulerStatus(): {
  running: boolean;
  activeJobs: string[];
  tasks: typeof SCHEDULED_TASKS;
} {
  return {
    running: activeJobs.size > 0,
    activeJobs: Array.from(activeJobs.keys()),
    tasks: SCHEDULED_TASKS,
  };
}

/**
 * Manually trigger a scheduled task
 *
 * This function allows manual execution of a scheduled task,
 * useful for testing or immediate execution needs.
 */
export async function triggerTask(taskName: string): Promise<{
  success: boolean;
  message: string;
  result?: any;
}> {
  try {
    logger.info('scheduler', `Manually triggering task: ${taskName}`);

    let result: any;

    switch (taskName) {
      case 'actionItemsRefresh':
        await refreshActionItemsView();
        break;
      case 'touchpointMVRefresh':
        result = await refreshAllMaterializedViews();
        break;
      case 'cacheWarming':
        result = await warmAllAssignedClientsCache();
        break;
      default:
        throw new Error(`Unknown task: ${taskName}`);
    }

    return {
      success: true,
      message: `Task ${taskName} executed successfully`,
      result,
    };
  } catch (error: any) {
    logger.error('scheduler', `Failed to trigger task: ${taskName}`, {
      error: error.message,
    });
    return {
      success: false,
      message: `Failed to execute task ${taskName}: ${error.message}`,
    };
  }
}
