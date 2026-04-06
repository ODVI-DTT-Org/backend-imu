/**
 * Feature Flags API Routes
 *
 * Endpoints for managing feature flags and checking feature availability.
 * Protected by authentication and role-based access control.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  isFeatureEnabled,
  getAllFeatureFlags,
  upsertFeatureFlag,
  deleteFeatureFlag,
  initializeFeatureFlags,
} from '../services/featureFlags.js';

const featureFlags = new Hono();

// Apply authentication middleware to all routes
featureFlags.use('*', authMiddleware);

/**
 * Validation schemas
 */
const checkFeatureSchema = z.object({
  feature: z.string().min(1),
});

const upsertFeatureFlagSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  userWhitelist: z.array(z.string()).optional(),
  roleWhitelist: z.array(z.string()).optional(),
  environmentWhitelist: z.array(z.string()).optional(),
  percentage: z.number().min(0).max(100).optional(),
});

/**
 * GET /api/feature-flags/check/:featureName
 * Check if a feature is enabled for the current user
 */
featureFlags.get('/check/:featureName', async (c) => {
  try {
    const user = c.get('user');
    const featureName = c.req.param('featureName');

    if (!featureName) {
      return c.json({
        success: false,
        message: 'Feature name is required',
      }, 400);
    }

    const enabled = await isFeatureEnabled(
      featureName,
      user.sub,
      user.role
    );

    return c.json({
      success: true,
      enabled,
      feature: featureName,
      user: {
        id: user.sub,
        role: user.role,
      },
    });
  } catch (error: any) {
    logger.error('feature-flags/check', error);
    return c.json({
      success: false,
      message: 'Failed to check feature flag',
      error: error.message,
    }, 500);
  }
});

/**
 * POST /api/feature-flags/check
 * Check multiple features at once
 */
featureFlags.post('/check', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validated = checkFeatureSchema.safeParse(body);

    if (!validated.success) {
      return c.json({
        success: false,
        message: 'Invalid request body',
        errors: validated.error.errors,
      }, 400);
    }

    const enabled = await isFeatureEnabled(
      validated.data.feature,
      user.sub,
      user.role
    );

    return c.json({
      success: true,
      enabled,
      feature: validated.data.feature,
      user: {
        id: user.sub,
        role: user.role,
      },
    });
  } catch (error: any) {
    logger.error('feature-flags/check', error);
    return c.json({
      success: false,
      message: 'Failed to check feature flag',
      error: error.message,
    }, 500);
  }
});

/**
 * GET /api/feature-flags
 * Get all feature flags (admin only)
 */
featureFlags.get('/', requireRole('admin'), async (c) => {
  try {
    const flags = await getAllFeatureFlags();

    return c.json({
      success: true,
      flags,
      count: flags.length,
    });
  } catch (error: any) {
    logger.error('feature-flags/list', error);
    return c.json({
      success: false,
      message: 'Failed to get feature flags',
      error: error.message,
    }, 500);
  }
});

/**
 * PUT /api/feature-flags/:name
 * Create or update a feature flag (admin only)
 */
featureFlags.put('/:name', requireRole('admin'), async (c) => {
  try {
    const name = c.req.param('name');

    if (!name) {
      return c.json({
        success: false,
        message: 'Feature name is required',
      }, 400);
    }

    const body = await c.req.json();
    const validated = upsertFeatureFlagSchema.safeParse(body);

    if (!validated.success) {
      return c.json({
        success: false,
        message: 'Invalid request body',
        errors: validated.error.errors,
      }, 400);
    }

    const flag = await upsertFeatureFlag(name, validated.data);

    logger.info('feature-flags/upsert', `Feature flag upserted: ${name}`, {
      enabled: flag.enabled,
      percentage: flag.percentage,
    });

    return c.json({
      success: true,
      flag,
    });
  } catch (error: any) {
    logger.error('feature-flags/upsert', error);
    return c.json({
      success: false,
      message: 'Failed to upsert feature flag',
      error: error.message,
    }, 500);
  }
});

/**
 * DELETE /api/feature-flags/:name
 * Delete a feature flag (admin only)
 */
featureFlags.delete('/:name', requireRole('admin'), async (c) => {
  try {
    const name = c.req.param('name');

    if (!name) {
      return c.json({
        success: false,
        message: 'Feature name is required',
      }, 400);
    }

    const deleted = await deleteFeatureFlag(name);

    if (!deleted) {
      return c.json({
        success: false,
        message: 'Feature flag not found',
      }, 404);
    }

    logger.info('feature-flags/delete', `Feature flag deleted: ${name}`);

    return c.json({
      success: true,
      message: 'Feature flag deleted',
    });
  } catch (error: any) {
    logger.error('feature-flags/delete', error);
    return c.json({
      success: false,
      message: 'Failed to delete feature flag',
      error: error.message,
    }, 500);
  }
});

/**
 * POST /api/feature-flags/initialize
 * Initialize default feature flags (admin only)
 */
featureFlags.post('/initialize', requireRole('admin'), async (c) => {
  try {
    await initializeFeatureFlags();

    logger.info('feature-flags/initialize', 'Feature flags initialized');

    return c.json({
      success: true,
      message: 'Feature flags initialized successfully',
    });
  } catch (error: any) {
    logger.error('feature-flags/initialize', error);
    return c.json({
      success: false,
      message: 'Failed to initialize feature flags',
      error: error.message,
    }, 500);
  }
});

export default featureFlags;
