/**
 * User Location Assignment Job Processor
 *
 * Processes municipality assignments to users in background chunks.
 */

import { pool } from '../db/index.js';
import {
  BackgroundJob,
  completeJob,
  failJob,
  updateProgress,
  JobProcessor,
} from './backgroundJob.js';
import { logger } from '../utils/logger.js';

const BATCH_SIZE = 50; // Process 50 assignments per batch

interface UserLocationResult {
  user_id: string;
  municipality_id: string;
  status: 'assigned' | 'failed';
  error?: string;
}

interface UserLocationAssignmentResult {
  summary: {
    total_processed: number;
    assigned_count: number;
    failed_count: number;
  };
  assignments: UserLocationResult[];
}

/**
 * Get users that need municipality assignment
 */
async function getUsersNeedingAssignment(limit: number, offset: number, filterMunicipalityIds?: string[]): Promise<any[]> {
  let query = '';
  let params: any[] = [];

  if (filterMunicipalityIds && filterMunicipalityIds.length > 0) {
    query = `
      SELECT u.id, u.first_name, u.last_name, u.email
      FROM users u
      WHERE u.deleted_at IS NULL
        AND u.id IN (
          SELECT DISTINCT ul.user_id
          FROM user_locations ul
          WHERE ul.municipality_id = ANY($1)
            AND ul.deleted_at IS NULL
        )
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    params = [filterMunicipalityIds, limit, offset];
  } else {
    query = `
      SELECT u.id, u.first_name, u.last_name, u.email
      FROM users u
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    params = [limit, offset];
  }

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Count total users needing assignment
 */
async function countUsersNeedingAssignment(filterMunicipalityIds?: string[]): Promise<number> {
  let query = '';
  let params: any[] = [];

  if (filterMunicipalityIds && filterMunicipalityIds.length > 0) {
    query = `
      SELECT COUNT(*) as count
      FROM users u
      WHERE u.deleted_at IS NULL
        AND u.id IN (
          SELECT DISTINCT ul.user_id
          FROM user_locations ul
          WHERE ul.municipality_id = ANY($1)
            AND ul.deleted_at IS NULL
        )
    `;
    params = [filterMunicipalityIds];
  } else {
    query = `
      SELECT COUNT(*) as count
      FROM users u
      WHERE u.deleted_at IS NULL
    `;
    params = [];
  }

  const result = await pool.query(query, params);
  return parseInt(result.rows[0].count);
}

/**
 * Assign municipality to user
 */
async function assignMunicipalityToUser(
  userId: string,
  municipalityId: string,
  assignedBy: string
): Promise<UserLocationResult> {
  try {
    // Check if assignment already exists
    const existing = await pool.query(
      'SELECT id, deleted_at FROM user_locations WHERE user_id = $1 AND municipality_id = $2',
      [userId, municipalityId]
    );

    if (existing.rows.length > 0) {
      const record = existing.rows[0];

      // Reactivate if deleted
      if (record.deleted_at) {
        await pool.query(
          'UPDATE user_locations SET deleted_at = NULL, assigned_at = NOW(), assigned_by = $1 WHERE id = $2',
          [assignedBy, record.id]
        );
      }

      return {
        user_id: userId,
        municipality_id: municipalityId,
        status: 'assigned',
      };
    }

    // Create new assignment
    await pool.query(
      'INSERT INTO user_locations (id, user_id, municipality_id, assigned_at, assigned_by) VALUES (gen_random_uuid(), $1, $2, NOW(), $3)',
      [userId, municipalityId, assignedBy]
    );

    return {
      user_id: userId,
      municipality_id: municipalityId,
      status: 'assigned',
    };
  } catch (error: any) {
    return {
      user_id: userId,
      municipality_id: municipalityId,
      status: 'failed',
      error: error.message,
    };
  }
}

/**
 * Process user location assignment job
 */
export async function processUserLocationAssignment(job: BackgroundJob): Promise<UserLocationAssignmentResult> {
  const { municipality_ids, user_id } = job.params;

  logger.info('user-location-job', `Starting user location assignment job ${job.id}`);

  let totalUsers = 0;
  const results: UserLocationResult[] = [];

  if (user_id) {
    // Assign specific municipalities to specific user
    totalUsers = 1;

    for (const municipalityId of municipality_ids) {
      const result = await assignMunicipalityToUser(user_id, municipalityId, job.created_by || 'system');

      results.push(result);

      // Update progress
      const progress = Math.round((results.length / municipality_ids.length) * 100);
      await updateProgress(job.id, progress);
    }
  } else {
    // Get users that need these municipalities assigned
    totalUsers = await countUsersNeedingAssignment(municipality_ids);
    logger.info('user-location-job', `Found ${totalUsers} users needing assignment`);

    let processedCount = 0;

    // Process in batches
    for (let offset = 0; offset < totalUsers; offset += BATCH_SIZE) {
      const users = await getUsersNeedingAssignment(BATCH_SIZE, offset, municipality_ids);

      for (const user of users) {
        // Assign all municipalities to this user
        for (const municipalityId of municipality_ids) {
          const result = await assignMunicipalityToUser(user.id, municipalityId, job.created_by || 'system');
          results.push(result);
        }

        processedCount++;

        // Update progress every 10 users
        if (processedCount % 10 === 0) {
          const progress = Math.round((processedCount / totalUsers) * 100);
          await updateProgress(job.id, progress);
          logger.debug('user-location-job', `Progress: ${progress}% (${processedCount}/${totalUsers})`);
        }
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Calculate summary
  const assigned = results.filter(r => r.status === 'assigned');
  const failed = results.filter(r => r.status === 'failed');

  const summary = {
    total_processed: results.length,
    assigned_count: assigned.length,
    failed_count: failed.length,
  };

  logger.info('user-location-job', `Completed user location assignment: ${summary.assigned_count}/${summary.total_processed} assigned`);

  return {
    summary,
    assignments: results.slice(0, 100), // Limit results in response
  };
}

/**
 * User location assignment job processor
 */
export const userLocationAssignmentProcessor: JobProcessor = {
  type: 'user_location_assignment',
  process: processUserLocationAssignment,
};
