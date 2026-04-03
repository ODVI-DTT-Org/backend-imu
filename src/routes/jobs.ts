/**
 * Background Jobs API Routes
 *
 * Endpoints for managing background jobs like PSGC matching and report generation.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { ValidationError } from '../errors/index.js';
import {
  createJob,
  getJob,
  getJobsForUser,
  cancelJob,
  updateProgress,
  startJobProcessor,
} from '../services/backgroundJob.js';
import { psgcMatchingProcessor } from '../services/psgcJobProcessor.js';
import { reportsJobProcessor } from '../services/reportsJobProcessor.js';
import { userLocationAssignmentProcessor } from '../services/userLocationJobProcessor.js';
import { logger } from '../utils/logger.js';
import { getQueueManager } from '../queues/index.js';
import { requireRole } from '../middleware/auth.js';

const jobs = new Hono();

// Apply authentication middleware to all routes
jobs.use('*', authMiddleware);

/**
 * Validation schemas
 */
const createPSGCJobSchema = z.object({
  dry_run: z.boolean().optional(),
});

const createReportJobSchema = z.object({
  report_type: z.enum(['agent_performance', 'client_activity', 'touchpoint_summary']),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  user_id: z.string().optional(),
});

const createUserLocationAssignmentSchema = z.object({
  municipality_ids: z.array(z.string()).min(1),
  user_id: z.string().optional(),
});

/**
 * POST /api/jobs/psgc/matching
 * Start PSGC matching background job
 */
jobs.post('/psgc/matching', requirePermission('clients', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createPSGCJobSchema.parse(body);

    // Create background job
    const job = await createJob({
      type: 'psgc_matching',
      params: validated,
      created_by: user.sub,
    });

    // Return immediately with job ID
    return c.json({
      success: true,
      job_id: job.id,
      message: 'PSGC matching job started',
      status_url: `/api/jobs/${job.id}`,
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
 * Generate report in background
 */
jobs.post('/reports/generate', requirePermission('reports', 'read'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createReportJobSchema.parse(body);

    // Create background job
    const job = await createJob({
      type: 'report_generation',
      params: validated,
      created_by: user.sub,
    });

    // Return immediately with job ID
    return c.json({
      success: true,
      job_id: job.id,
      message: 'Report generation job started',
      status_url: `/api/jobs/${job.id}`,
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
 * Assign municipalities to users in background
 */
jobs.post('/user-locations/assign', requirePermission('users', 'update'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = createUserLocationAssignmentSchema.parse(body);

    // Create background job
    const job = await createJob({
      type: 'user_location_assignment',
      params: validated,
      created_by: user.sub,
    });

    // Return immediately with job ID
    return c.json({
      success: true,
      job_id: job.id,
      message: 'User location assignment job started',
      status_url: `/api/jobs/${job.id}`,
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
 * GET /api/jobs/:id
 * Get job status and result
 */
jobs.get('/:id', async (c) => {
  try {
    const jobId = c.req.param('id');

    const job = await getJob(jobId);

    if (!job) {
      return c.json({
        success: false,
        message: 'Job not found',
      }, 404);
    }

    // Check if user owns this job or is admin
    const user = c.get('user');

    if (job.created_by && job.created_by !== user.sub && user.role !== 'admin') {
      return c.json({
        success: false,
        message: 'You do not have permission to view this job',
      }, 403);
    }

    return c.json({
      success: true,
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        total_items: job.total_items,
        result: job.result,
        error: job.error,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
      },
    });
  } catch (error: any) {
    logger.error('jobs/get', error);
    throw error;
  }
});

/**
 * GET /api/jobs
 * Get jobs for current user
 */
jobs.get('/', async (c) => {
  try {
    const user = c.get('user');
    const type = c.req.query('type') as any;
    const limit = parseInt(c.req.query('limit') || '20');

    const jobs = await getJobsForUser(user.sub, type, limit);

    return c.json({
      success: true,
      jobs: jobs.map(job => ({
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        total_items: job.total_items,
        created_at: job.created_at,
        completed_at: job.completed_at,
      })),
    });
  } catch (error: any) {
    logger.error('jobs/list', error);
    throw error;
  }
});

/**
 * DELETE /api/jobs/:id
 * Cancel a job
 */
jobs.delete('/:id', async (c) => {
  try {
    const jobId = c.req.param('id');
    const user = c.get('user');

    const job = await getJob(jobId);

    if (!job) {
      return c.json({
        success: false,
        message: 'Job not found',
      }, 404);
    }

    // Check if user owns this job or is admin
    if (job.created_by && job.created_by !== user.sub && user.role !== 'admin') {
      return c.json({
        success: false,
        message: 'You do not have permission to cancel this job',
      }, 403);
    }

    // Can only cancel pending or processing jobs
    if (job.status !== 'pending' && job.status !== 'processing') {
      return c.json({
        success: false,
        message: `Cannot cancel job with status ${job.status}`,
      }, 400);
    }

    await cancelJob(jobId);

    return c.json({
      success: true,
      message: 'Job cancelled',
    });
  } catch (error: any) {
    logger.error('jobs/cancel', error);
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

// Start job processor when this module is loaded
startJobProcessor([psgcMatchingProcessor, reportsJobProcessor, userLocationAssignmentProcessor], 5000);

export default jobs;
