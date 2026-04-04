/**
 * BullMQ Workers
 *
 * Registers and starts workers for all queue processors.
 * This file should be imported when starting the backend server.
 */

import { bulkDeleteProcessor } from './processors/bulk-delete-processor.js';
import { bulkApprovalsProcessor } from './processors/bulk-approvals-processor.js';
import { reportsProcessor } from './processors/reports-processor.js';
import { csvExportsProcessor } from './processors/csv-exports-processor.js';
import { locationAssignmentsProcessor } from './processors/location-assignments-processor.js';
import { syncOperationsProcessor } from './processors/sync-operations-processor.js';
import { getQueueManager } from './queue-manager.js';
import { logger } from '../utils/logger.js';

/**
 * Start all queue workers
 */
export async function startWorkers() {
  try {
    const queueManager = getQueueManager();

    // Removed verbose startup logs - now handled by init-logger

    // Register bulk delete processor
    await bulkDeleteProcessor.start();
    const deleteWorker = bulkDeleteProcessor.getWorker();
    if (deleteWorker) {
      queueManager.registerWorker('bulk-operations', deleteWorker);
    }

    // Register bulk approvals processor
    await bulkApprovalsProcessor.start();
    const approvalsWorker = bulkApprovalsProcessor.getWorker();
    if (approvalsWorker) {
      queueManager.registerWorker('bulk-operations', approvalsWorker);
    }

    // Register reports processor
    await reportsProcessor.start();
    const reportsWorker = reportsProcessor.getWorker();
    if (reportsWorker) {
      queueManager.registerWorker('reports', reportsWorker);
    }

    // Register CSV exports processor
    await csvExportsProcessor.start();
    const csvExportsWorker = csvExportsProcessor.getWorker();
    if (csvExportsWorker) {
      queueManager.registerWorker('reports', csvExportsWorker);
    }

    // Register location assignments processor
    await locationAssignmentsProcessor.start();
    const locationAssignmentsWorker = locationAssignmentsProcessor.getWorker();
    if (locationAssignmentsWorker) {
      queueManager.registerWorker('location-assignments', locationAssignmentsWorker);
    }

    // Register sync operations processor
    await syncOperationsProcessor.start();
    const syncOperationsWorker = syncOperationsProcessor.getWorker();
    if (syncOperationsWorker) {
      queueManager.registerWorker('sync-operations', syncOperationsWorker);
    }

    // Removed verbose startup logs - now handled by init-logger
  } catch (error) {
    logger.error('Workers', 'Failed to start workers', error);
    throw error;
  }
}

/**
 * Stop all queue workers
 */
export async function stopWorkers() {
  try {
    logger.info('Workers', 'Stopping bulk delete processor...');
    await bulkDeleteProcessor.stop();

    logger.info('Workers', 'Stopping bulk approvals processor...');
    await bulkApprovalsProcessor.stop();

    logger.info('Workers', 'Stopping reports processor...');
    await reportsProcessor.stop();

    logger.info('Workers', 'Stopping CSV exports processor...');
    await csvExportsProcessor.stop();

    logger.info('Workers', 'Stopping location assignments processor...');
    await locationAssignmentsProcessor.stop();

    logger.info('Workers', 'Stopping sync operations processor...');
    await syncOperationsProcessor.stop();

    logger.info('Workers', 'All workers stopped successfully');
  } catch (error) {
    logger.error('Workers', 'Failed to stop workers', error);
    throw error;
  }
}

// Auto-start workers when this module is imported
startWorkers().catch(error => {
  logger.error('Workers', 'Failed to auto-start workers', error);
  console.error('Failed to start queue workers:', error);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Workers', 'SIGTERM received, stopping workers...');
  await stopWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Workers', 'SIGINT received, stopping workers...');
  await stopWorkers();
  process.exit(0);
});
