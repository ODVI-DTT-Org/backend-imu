/**
 * Feature Flag Service
 * Manages feature flags for controlled rollout of new features
 *
 * This service allows enabling/disabling features for specific users, roles, or environments.
 * Features can be rolled out gradually to minimize risk and gather feedback.
 */

import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  userWhitelist?: string[]; // List of user IDs who have access
  roleWhitelist?: string[]; // List of roles who have access
  environmentWhitelist?: string[]; // List of environments (dev, qa, prod)
  percentage: number; // Percentage rollout (0-100)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Check if a feature is enabled for a specific user
 *
 * @param featureName - The name of the feature to check
 * @param userId - The user ID to check access for
 * @param userRole - The user's role to check against role whitelist
 * @returns Promise<boolean> - True if the feature is enabled for the user
 */
export async function isFeatureEnabled(
  featureName: string,
  userId: string,
  userRole?: string
): Promise<boolean> {
  try {
    const client = await pool.connect();

    try {
      // Get the feature flag
      const result = await client.query(
        'SELECT * FROM feature_flags WHERE name = $1 AND enabled = true',
        [featureName]
      );

      if (result.rows.length === 0) {
        // Feature doesn't exist or is disabled
        return false;
      }

      const feature = result.rows[0] as FeatureFlag;

      // Check environment whitelist
      const environment = process.env.NODE_ENV || 'development';
      if (
        feature.environmentWhitelist &&
        feature.environmentWhitelist.length > 0 &&
        !feature.environmentWhitelist.includes(environment)
      ) {
        return false;
      }

      // Check percentage rollout (using user ID hash for consistent assignment)
      if (feature.percentage < 100) {
        const userHash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const rolloutThreshold = (feature.percentage / 100) * Number.MAX_SAFE_INTEGER;
        const userIsIncluded = userHash < rolloutThreshold;

        if (!userIsIncluded) {
          return false;
        }
      }

      // Check user whitelist
      if (
        feature.userWhitelist &&
        feature.userWhitelist.length > 0 &&
        !feature.userWhitelist.includes(userId)
      ) {
        return false;
      }

      // Check role whitelist
      if (
        feature.roleWhitelist &&
        feature.roleWhitelist.length > 0 &&
        userRole &&
        !feature.roleWhitelist.includes(userRole)
      ) {
        return false;
      }

      return true;
    } finally {
      client.release();
    }
  } catch (error: any) {
    logger.error('feature-flags', 'Error checking feature flag', {
      featureName,
      userId,
      error: error.message,
    });
    return false; // Fail closed for safety
  }
}

/**
 * Get all feature flags (admin only)
 */
export async function getAllFeatureFlags(): Promise<FeatureFlag[]> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      'SELECT * FROM feature_flags ORDER BY created_at DESC'
    );

    return result.rows as FeatureFlag[];
  } finally {
    client.release();
  }
}

/**
 * Create or update a feature flag (admin only)
 */
export async function upsertFeatureFlag(
  name: string,
  config: {
    description?: string;
    enabled?: boolean;
    userWhitelist?: string[];
    roleWhitelist?: string[];
    environmentWhitelist?: string[];
    percentage?: number;
  }
): Promise<FeatureFlag> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `INSERT INTO feature_flags (name, description, enabled, user_whitelist, role_whitelist, environment_whitelist, percentage, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (name) DO UPDATE SET
         description = COALESCE(EXCLUDED.description, $2),
         enabled = COALESCE(EXCLUDED.enabled, $3),
         user_whitelist = COALESCE(EXCLUDED.user_whitelist, $4),
         role_whitelist = COALESCE(EXCLUDED.role_whitelist, $5),
         environment_whitelist = COALESCE(EXCLUDED.environment_whitelist, $6),
         percentage = COALESCE(EXCLUDED.percentage, $7),
         updated_at = NOW()
       RETURNING *`,
      [
        name,
        config.description || '',
        config.enabled || false,
        config.userWhitelist || [],
        config.roleWhitelist || [],
        config.environmentWhitelist || [],
        config.percentage || 0,
      ]
    );

    return result.rows[0] as FeatureFlag;
  } finally {
    client.release();
  }
}

/**
 * Delete a feature flag (admin only)
 */
export async function deleteFeatureFlag(name: string): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query('DELETE FROM feature_flags WHERE name = $1', [name]);
    return true;
  } finally {
    client.release();
  }
}

/**
 * Initialize default feature flags
 *
 * Creates the default feature flags for the dashboard system if they don't exist.
 */
export async function initializeFeatureFlags(): Promise<void> {
  const defaultFlags = [
    {
      name: 'dashboard_redesign',
      description: 'New dashboard with target progress, team performance, and action items',
      enabled: true,
      environmentWhitelist: ['development', 'qa'],
      roleWhitelist: ['admin', 'area_manager', 'assistant_area_manager'],
      percentage: 100,
    },
    {
      name: 'target_tracking',
      description: 'Target progress tracking with period-based goals',
      enabled: true,
      environmentWhitelist: ['development', 'qa'],
      roleWhitelist: ['admin', 'area_manager'],
      percentage: 50, // Roll out to 50% of users first
    },
    {
      name: 'team_performance',
      description: 'Team performance rankings and metrics',
      enabled: true,
      environmentWhitelist: ['development', 'qa'],
      roleWhitelist: ['admin', 'area_manager'],
      percentage: 50,
    },
    {
      name: 'action_items_drawer',
      description: 'Action items drawer with priority filtering',
      enabled: true,
      environmentWhitelist: ['development', 'qa', 'production'],
      percentage: 100, // Fully rolled out
    },
  ];

  for (const flag of defaultFlags) {
    try {
      await upsertFeatureFlag(flag.name, flag);
      logger.info('feature-flags', `Initialized feature flag: ${flag.name}`);
    } catch (error: any) {
      logger.error('feature-flags', `Failed to initialize feature flag: ${flag.name}`, {
        error: error.message,
      });
    }
  }
}
