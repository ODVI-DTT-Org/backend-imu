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
  report_type: z.enum([
    'agent_performance', 'client_activity', 'touchpoint_summary', 'market_saturation', 'itinerary_analysis',
    'daily_visits', 'daily_calls', 'caravan_releases', 'tele_releases', 'odometer', 'releases_by_loan_type',
  ]),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  user_id: z.string().optional(),
  // Market Saturation filters (all optional, AND-composed; empty/missing = include all)
  team_ids: z.array(z.string().uuid()).optional(),
  categories: z.array(z.enum(['VIRGIN', 'FAVORABLE', 'OTHERS', 'EXISTING'])).optional(),
  regions: z.array(z.string()).optional(),
  // Filters for queued XLSX report handlers
  loan_type: z.string().optional(),
  product_type: z.string().optional(),
  status: z.string().optional(),
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

    // COUNT only — do NOT load all IDs into memory here.
    // Storing thousands of UUIDs in the BullMQ Redis payload causes OOM.
    // The processor will query unmatched IDs fresh from DB when the job runs.
    const countResult = await pool.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM clients
      WHERE psgc_id IS NULL
        AND deleted_at IS NULL
        AND province IS NOT NULL
        AND municipality IS NOT NULL
    `);

    const totalClients = parseInt(countResult.rows[0].count);

    logger.info(
      'jobs/psgc/matching',
      `PSGC matching candidate count=${totalClients}`
    );

    if (totalClients === 0) {
      logger.warn('jobs/psgc/matching', 'PSGC matching request found zero eligible unmatched clients');
    }

    const job = await addLocationJob(
      LocationJobType.PSGC_MATCHING,
      user.sub,
      [],
      { ...validated, fetchUnmatchedFromDb: true },
    );

    logger.info(
      'jobs/psgc/matching',
      `PSGC matching job enqueued job_id=${job.id} total_clients=${totalClients}`
    );

    return c.json({
      success: true,
      job_id: job.id,
      message: 'PSGC matching job started',
      total_clients: totalClients,
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
      itinerary_analysis: ReportJobType.REPORT_ITINERARY_ANALYSIS,
      daily_visits: ReportJobType.REPORT_DAILY_VISITS,
      daily_calls: ReportJobType.REPORT_DAILY_CALLS,
      caravan_releases: ReportJobType.REPORT_CARAVAN_RELEASES,
      tele_releases: ReportJobType.REPORT_TELE_RELEASES,
      odometer: ReportJobType.REPORT_ODOMETER,
      releases_by_loan_type: ReportJobType.REPORT_RELEASES_BY_LOAN_TYPE,
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
      ...(validated.loan_type    ? { loan_type:    validated.loan_type    } : {}),
      ...(validated.product_type ? { product_type: validated.product_type } : {}),
      ...(validated.status       ? { status:       validated.status       } : {}),
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
jobs.get('/queue/jobs', authMiddleware, async (c) => {
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
jobs.get('/queue/:jobId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const jobId = c.req.param('jobId');

    if (!jobId) {
      return c.json({ success: false, message: 'Job ID required' }, 400);
    }

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
jobs.delete('/queue/:jobId', authMiddleware, async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const user = c.get('user');

    if (!jobId) {
      return c.json({ success: false, message: 'Job ID required' }, 400);
    }

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

/**
 * DELETE /api/jobs/queue?state=completed|failed
 * Remove all completed or failed BullMQ jobs belonging to the current user.
 * Admin users can clear jobs across all users.
 */
jobs.delete('/queue', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const state = c.req.query('state') as 'completed' | 'failed' | undefined;

    if (!state || (state !== 'completed' && state !== 'failed')) {
      return c.json({ success: false, message: 'Query param "state" must be "completed" or "failed"' }, 400);
    }

    const queueManager = getQueueManager();
    const queues = ['bulk-operations', 'reports', 'location-assignments', 'sync-operations'] as const;

    let removed = 0;

    for (const queueName of queues) {
      try {
        const queue = queueManager.getQueue({ name: queueName });
        const queueJobs = await queue.getJobs([state], 0, 500);

        for (const job of queueJobs) {
          const jobUserId = job.data?.userId;
          if (user.role !== 'admin' && jobUserId !== user.sub) continue;

          try {
            await job.remove();
            removed++;
          } catch {
            // Job may have already been removed — skip
          }
        }
      } catch (error) {
        logger.error('jobs/queue/clear', `Failed to clear ${state} jobs from queue ${queueName}`, error);
      }
    }

    return c.json({ success: true, removed });
  } catch (error: any) {
    logger.error('jobs/queue/clear', error);
    return c.json({ success: false, message: 'Failed to clear jobs', error: error.message }, 500);
  }
});

export default jobs;
