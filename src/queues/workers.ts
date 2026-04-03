/**
 * BullMQ Workers
 *
 * Registers and starts workers for all queue processors.
 * This file should be imported when starting the backend server.
 */

import { bulkDeleteProcessor } from './processors/bulk-delete-processor.js';
import { bulkApprovalsProcessor } from './processors/bulk-approvals-processor.js';
import { getQueueManager } from './queue-manager.js';
import { logger } from '../utils/logger.js';

/**
 * Start all queue workers
 */
export async function startWorkers() {
  try {
    const queueManager = getQueueManager();

    // Register bulk delete processor
    logger.info('Workers', 'Starting bulk delete processor...');
    await bulkDeleteProcessor.start();
    const deleteWorker = bulkDeleteProcessor.getWorker();
    if (deleteWorker) {
      queueManager.registerWorker('bulk-operations', deleteWorker);
    }

    // Register bulk approvals processor
    logger.info('Workers', 'Starting bulk approvals processor...');
    await bulkApprovalsProcessor.start();
    const approvalsWorker = bulkApprovalsProcessor.getWorker();
    if (approvalsWorker) {
      queueManager.registerWorker('bulk-operations', approvalsWorker);
    }

    logger.info('Workers', 'All workers started successfully');
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
