/**
 * Background Jobs API Routes
 *
 * Endpoints for managing background jobs via BullMQ/Redis.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { ValidationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import { getQueueManager } from '../queues/index.js';
import { requireRole } from '../middleware/auth.js';
import { addLocationJob, addReportJob, getJobStatus, cancelJob as cancelBullMQJob } from '../queues/utils/job-helpers.js';
import { LocationJobType, ReportJobType } from '../queues/jobs/job-types.js';
import { manualRefreshActionItems } from '../services/actionItemsRefreshService.js';
import { getSchedulerStatus, triggerTask } from '../services/cronScheduler.js';
import { pool } from '../db/index.js';

const jobs = new Hono();

function getJobSortTime(job: {
  finishedOn?: string | number | null;
  processedOn?: string | number | null;
  timestamp?: string | number | null;
}) {
  const candidates = [job.finishedOn, job.processedOn, job.timestamp];

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = new Date(value).getTime();
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function getJobStatePriority(state: string) {
  switch (state) {
    case 'active':
      return 0;
    case 'waiting':
      return 1;
    case 'delayed':
      return 2;
    case 'failed':
      return 3;
    case 'completed':
      return 4;
    default:
      return 5;
  }
}

// Apply authentication middleware to all routes
jobs.use('*', authMiddleware);

/**
 * Validation schemas
 */
const createPSGCJobSchema = z.object({
  dry_run: z.boolean().optional(),
});

export const createReportJobSchema = z.object({
  report_type: z.enum(['agent_performance', 'client_activity', 'touchpoint_summary', 'market_saturation']),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  user_id: z.string().optional(),
  // Market Saturation filters (all optional, AND-composed; empty/missing = include all)
  team_ids: z.array(z.string().uuid()).optional(),
  categories: z.array(z.enum(['VIRGIN', 'FAVORABLE', 'OTHERS', 'EXISTING'])).optional(),
  regions: z.array(z.string()).optional(),
});

const createUserLocationAssignmentSchema = z.object({
  municipality_ids: z.array(z.string()).min(1),
  user_id: z.string(),
});

/**
 * POST /api/jobs/psgc/matching
 * Start PSGC matching job via BullMQ
 */
jobs.post('/psgc/matching', requirePermission('clients', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createPSGCJobSchema.parse(body);

    logger.info(
      'jobs/psgc/matching',
      `PSGC matching request received for user=${user.sub} dry_run=${validated.dry_run === true ? 'true' : 'false'}`
    );

    const unmatchedClients = await pool.query<{ id: string }>(`
      SELECT id
      FROM clients
      WHERE psgc_id IS NULL
        AND deleted_at IS NULL
        AND province IS NOT NULL
        AND municipality IS NOT NULL
      ORDER BY created_at ASC
    `);

    const clientIds = unmatchedClients.rows.map((row) => row.id);

    logger.info(
      'jobs/psgc/matching',
      `PSGC matching candidate query returned count=${clientIds.length}`
    );

    if (clientIds.length > 0) {
      logger.info(
        'jobs/psgc/matching',
        `PSGC matching first candidates=${clientIds.slice(0, 5).join(',')}`
      );
    } else {
      logger.warn('jobs/psgc/matching', 'PSGC matching request found zero eligible unmatched clients');
    }

    const job = await addLocationJob(LocationJobType.PSGC_MATCHING, user.sub, clientIds, validated);

    logger.info(
      'jobs/psgc/matching',
      `PSGC matching job enqueued job_id=${job.id} total_clients=${clientIds.length}`
    );

    return c.json({
      success: true,
      job_id: job.id,
      message: 'PSGC matching job started',
      total_clients: clientIds.length,
      status_url: `/api/jobs/queue/${job.id}`,
    }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    logger.error('jobs/psgc/matching', error);
    throw error;
  }
});

/**
 * POST /api/jobs/reports/generate
 * Generate report in background via BullMQ
 */
jobs.post('/reports/generate', requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createReportJobSchema.parse(body);

    const reportTypeMap: Record<string, ReportJobType> = {
      agent_performance: ReportJobType.REPORT_AGENT_PERFORMANCE,
      client_activity: ReportJobType.REPORT_CLIENT_ACTIVITY,
      touchpoint_summary: ReportJobType.REPORT_TOUCHPOINT_SUMMARY,
      market_saturation: ReportJobType.REPORT_MARKET_SATURATION,
    };
    const jobType = reportTypeMap[validated.report_type] ?? ReportJobType.REPORT_AGENT_PERFORMANCE;

    // Market-Saturation filters travel inside params.filters so we don't widen the
    // shared ReportJobData['params'] type for one report.
    const hasMSFilters =
      validated.report_type === 'market_saturation' &&
      (validated.team_ids?.length || validated.categories?.length || validated.regions?.length);

    const job = await addReportJob(jobType, user.sub, {
      startDate: validated.start_date,
      endDate: validated.end_date,
      userId: validated.user_id,
      ...(hasMSFilters
        ? {
            filters: {
              team_ids: validated.team_ids ?? [],
              categories: validated.categories ?? [],
              regions: validated.regions ?? [],
            },
          }
        : {}),
    });

    return c.json({
      success: true,
      job_id: job.id,
      message: 'Report generation job started',
      status_url: `/api/jobs/queue/${job.id}`,
    }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    logger.error('jobs/reports/generate', error);
    throw error;
  }
});

/**
 * POST /api/jobs/user-locations/assign
 * Assign municipalities to users via BullMQ
 */
jobs.post('/user-locations/assign', requirePermission('users', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createUserLocationAssignmentSchema.parse(body);

    const job = await addLocationJob(
      LocationJobType.BULK_ASSIGN_USER_MUNICIPALITIES,
      user.sub,
      [validated.user_id],
      { municipalityIds: validated.municipality_ids }
    );

    return c.json({
      success: true,
      job_id: job.id,
      message: 'User location assignment job started',
      status_url: `/api/jobs/queue/${job.id}`,
    }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError('Invalid input');
      error.errors.forEach((err: any) => {
        validationError.addFieldError(err.path[0] || 'unknown', err.message);
      });
      throw validationError;
    }
    logger.error('jobs/user-locations/assign', error);
    throw error;
  }
});


/**
 * GET /api/jobs/health
 * Get queue system health status (admin only)
 */
jobs.get('/health', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const queueManager = getQueueManager();
    const health = await queueManager.getHealth();

    return c.json({
      success: true,
      health,
    });
  } catch (error: any) {
    logger.error('jobs/health', error);
    return c.json({
      success: false,
      message: 'Failed to get queue health',
      error: error.message,
    }, 500);
  }
});

/**
 * POST /api/jobs/refresh/action-items
 * Manually refresh the action_items materialized view (admin only)
 */
jobs.post('/refresh/action-items', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const result = await manualRefreshActionItems();
    return c.json(result);
  } catch (error: any) {
    logger.error('jobs/refresh-action-items', error);
    return c.json({
      success: false,
      message: 'Failed to refresh action items',
      error: error.message,
    }, 500);
  }
});

/**
 * GET /api/jobs/scheduler/status
 * Get cron scheduler status (admin only)
 */
jobs.get('/scheduler/status', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const status = getSchedulerStatus();
    return c.json({
      success: true,
      scheduler: status,
    });
  } catch (error: any) {
    logger.error('jobs/scheduler-status', error);
    return c.json({
      success: false,
      message: 'Failed to get scheduler status',
      error: error.message,
    }, 500);
  }
});

/**
 * POST /api/jobs/scheduler/trigger/:taskName
 * Manually trigger a scheduled task (admin only)
 */
jobs.post('/scheduler/trigger/:taskName', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const taskName = c.req.param('taskName');

    if (!taskName) {
      return c.json({
        success: false,
        message: 'Task name is required',
      }, 400);
    }

    const result = await triggerTask(taskName);
    return c.json(result);
  } catch (error: any) {
    logger.error('jobs/trigger-task', error);
    return c.json({
      success: false,
      message: 'Failed to trigger task',
      error: error.message,
    }, 500);
  }
});


/**
 * GET /api/jobs/queue/jobs
 * Get BullMQ jobs for the current user (admin sees all jobs)
 */
jobs.get('/queue/jobs', async (c) => {
  try {
    const user = c.get('user');
    const queueManager = getQueueManager();
    const queues = ['bulk-operations', 'reports', 'location-assignments', 'sync-operations'] as const;

    const allJobs: any[] = [];

    for (const queueName of queues) {
      try {
        const queue = queueManager.getQueue({ name: queueName });
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

        // Get recent jobs from each state
        const states = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const;

        for (const state of states) {
          if (counts[state] === 0) continue;

          const jobs = await queue.getJobs([state], 0, 24);

          for (const job of jobs) {
            // Filter jobs by user (admin sees all, regular users see only their own)
            const jobUserId = job.data?.userId;
            if (user.role !== 'admin' && jobUserId !== user.sub) {
              continue;
            }

            const jobState = await job.getState();
            allJobs.push({
              id: job.id,
              name: job.name,
              queueName,
              state: jobState,
              progress: job.progress,
              data: job.data,
              result: job.returnvalue,
              failedReason: job.failedReason,
              processedOn: job.processedOn,
              finishedOn: job.finishedOn,
              timestamp: job.timestamp,
              attemptsMade: job.attemptsMade,
            });
          }
        }
      } catch (error) {
        logger.error('jobs/queue/jobs', `Failed to get jobs from queue ${queueName}`, error);
        continue;
      }
    }

    // Keep waiting/active jobs visible even when there are many historical jobs.
    allJobs.sort((a, b) => {
      const priorityDiff = getJobStatePriority(a.state) - getJobStatePriority(b.state);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return getJobSortTime(b) - getJobSortTime(a);
    });

    return c.json({
      success: true,
      jobs: allJobs.slice(0, 100), // Limit to 100 most recent jobs
    });
  } catch (error: any) {
    logger.error('jobs/queue/jobs', error);
    return c.json({
      success: false,
      message: 'Failed to get queue jobs',
      error: error.message,
    }, 500);
  }
});

/**
 * GET /api/jobs/queue/:jobId
 * Get specific BullMQ job status (user must own the job or be admin)
 */
jobs.get('/queue/:jobId', async (c) => {
  try {
    const user = c.get('user');
    const jobId = c.req.param('jobId');

    const jobStatus = await getJobStatus(jobId);

    if (!jobStatus) {
      return c.json({
        success: false,
        message: 'Job not found',
      }, 404);
    }

    // Check if user owns this job or is admin
    const jobUserId = jobStatus.data?.userId;
    if (user.role !== 'admin' && jobUserId !== user.sub) {
      return c.json({
        success: false,
        message: 'You do not have permission to view this job',
      }, 403);
    }

    return c.json({
      success: true,
      job: jobStatus,
    });
  } catch (error: any) {
    logger.error('jobs/queue/get', error);
    return c.json({
      success: false,
      message: 'Failed to get job status',
      error: error.message,
    }, 500);
  }
});

/**
 * DELETE /api/jobs/queue/:jobId
 * Cancel a BullMQ job
 */
jobs.delete('/queue/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const user = c.get('user');

    const jobStatus = await getJobStatus(jobId);

    if (!jobStatus) {
      return c.json({
        success: false,
        message: 'Job not found',
      }, 404);
    }

    // Check if user owns this job or is admin
    const jobUserId = jobStatus.data?.userId;
    if (user.role !== 'admin' && jobUserId !== user.sub) {
      return c.json({
        success: false,
        message: 'You do not have permission to cancel this job',
      }, 403);
    }

    // Can only cancel waiting or active jobs
    if (jobStatus.state !== 'waiting' && jobStatus.state !== 'active') {
      return c.json({
        success: false,
        message: `Cannot cancel job with status ${jobStatus.state}`,
      }, 400);
    }

    await cancelBullMQJob(jobId);

    return c.json({
      success: true,
      message: 'Job cancelled',
    });
  } catch (error: any) {
    logger.error('jobs/queue/cancel', error);
    return c.json({
      success: false,
      message: 'Failed to cancel job',
      error: error.message,
    }, 500);
  }
});

export default jobs;
