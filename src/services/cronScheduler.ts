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
import { pool } from '../db/index.js';
import { cleanupOldNotifications, createNotification } from './notification.service.js';

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
  // Missed visit notifications daily at 8 AM
  missedVisitNotifications: {
    schedule: '0 8 * * *', // Daily at 8:00 AM
    description: 'Notify users with overdue pending itineraries',
    task: 'missedVisitNotifications',
  },
  // Delete notifications older than the retention window daily at 2:30 AM
  notificationCleanup: {
    schedule: '30 2 * * *', // Daily at 2:30 AM
    description: 'Delete notifications older than the configured retention window',
    task: 'notificationCleanup',
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

  // Start missed visit notifications job
  startMissedVisitNotificationsJob();

  // Start notification cleanup job
  startNotificationCleanupJob();

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

async function notifyMissedVisits(): Promise<number> {
  // Covers both sources:
  //   A) missed itineraries — past-due scheduled visits still pending
  //   B) overdue clients — no touchpoint in 7+ days, no future itinerary
  // Skips users already sent a missed_visit notification today to prevent spam.
  const result = await pool.query(`
    WITH missed_itineraries AS (
      SELECT i.user_id, i.client_id
      FROM itineraries i
      JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
      WHERE i.status = 'pending'
        AND i.scheduled_date < CURRENT_DATE
        AND i.scheduled_date >= CURRENT_DATE - INTERVAL '30 days'
        AND COALESCE(c.loan_released, false) IS NOT TRUE
    ),
    overdue_clients AS (
      SELECT tp.user_id, c.id AS client_id
      FROM clients c
      JOIN touchpoints tp ON tp.client_id = c.id
      WHERE c.deleted_at IS NULL
        AND COALESCE(c.loan_released, false) IS NOT TRUE
        AND c.next_touchpoint IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM itineraries i
          WHERE i.client_id = c.id AND i.user_id = tp.user_id
            AND i.status IN ('pending', 'in_progress')
            AND i.scheduled_date >= CURRENT_DATE
        )
      GROUP BY tp.user_id, c.id
      HAVING MAX(tp.date) < NOW() - INTERVAL '7 days'
    ),
    all_overdue AS (
      SELECT user_id, client_id FROM missed_itineraries
      UNION
      SELECT user_id, client_id FROM overdue_clients
    ),
    user_counts AS (
      SELECT user_id, COUNT(DISTINCT client_id) AS total
      FROM all_overdue
      GROUP BY user_id
    )
    SELECT
      uc.user_id,
      uc.total,
      CASE WHEN uc.total = 1
        THEN (SELECT client_id FROM all_overdue WHERE user_id = uc.user_id LIMIT 1)
        ELSE NULL
      END AS single_client_id
    FROM user_counts uc
    WHERE uc.total > 0
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = uc.user_id
          AND n.type = 'missed_visit'
          AND n.created_at >= CURRENT_DATE
      )
  `);

  for (const row of result.rows) {
    const count = Number(row.total);
    const title = 'Missed Visit Reminder';
    const body = count === 1
      ? 'You have 1 overdue client. Tap to follow up.'
      : `You have ${count} overdue clients. Tap to review.`;
    const fcmData: Record<string, string> = { type: 'missed_visit' };
    if (row.single_client_id) fcmData.client_id = row.single_client_id;

    await createNotification(
      row.user_id,
      'missed_visit',
      title,
      body,
      { overdue_count: count, client_id: row.single_client_id ?? null },
      fcmData,
    );
  }

  return result.rows.length;
}

/**
 * Notify users with overdue pending itineraries (runs at 8 AM daily)
 */
function startMissedVisitNotificationsJob(): void {
  const task = SCHEDULED_TASKS.missedVisitNotifications;

  const job = cron.schedule(task.schedule, async () => {
    try {
      logger.info('scheduler', `Executing scheduled task: ${task.task}`);
      const notified = await notifyMissedVisits();
      logger.info('scheduler', `${task.task}: notified ${notified} user(s) of overdue visits`);
    } catch (error: any) {
      logger.error('scheduler', `Failed to execute scheduled task: ${task.task}`, {
        error: error.message,
      });
    }
  });

  activeJobs.set(task.task, job);
  logger.info('scheduler', `Started cron job: ${task.task}`, { schedule: task.schedule });
}

function notificationRetentionDays(): number {
  const parsed = Number.parseInt(process.env.NOTIFICATION_RETENTION_DAYS || '3', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3;
}

/**
 * Delete notifications older than the configured retention window.
 */
function startNotificationCleanupJob(): void {
  const task = SCHEDULED_TASKS.notificationCleanup;

  const job = cron.schedule(task.schedule, async () => {
    try {
      const retentionDays = notificationRetentionDays();
      logger.info('scheduler', `Executing scheduled task: ${task.task}`, { retentionDays });
      const deleted = await cleanupOldNotifications(retentionDays);
      logger.info('scheduler', `${task.task}: deleted ${deleted} notification(s)`, {
        retentionDays,
      });
    } catch (error: any) {
      logger.error('scheduler', `Failed to execute scheduled task: ${task.task}`, {
        error: error.message,
      });
    }
  });

  activeJobs.set(task.task, job);
  logger.info('scheduler', `Started cron job: ${task.task}`, { schedule: task.schedule });
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
      case 'missedVisitNotifications':
        result = await notifyMissedVisits();
        break;
      case 'notificationCleanup':
        result = await cleanupOldNotifications(notificationRetentionDays());
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
