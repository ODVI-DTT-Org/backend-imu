/**
 * Queues Module
 *
 * Main export file for the BullMQ queuing system.
 * Exports queue manager, job types, and helper utilities.
 */

// Export queue manager
export {
  QueueManager,
  getQueueManager,
} from './queue-manager.js';

// Export job types and constants
export {
  BulkJobType,
  ReportJobType,
  LocationJobType,
  SyncJobType,
  QUEUE_NAMES,
  JobStatus,
} from './jobs/job-types.js';

export type {
  JobType,
  QueueName,
  BaseJobData,
  BulkJobData,
  ReportJobData,
  SyncJobData,
  JobResult,
  JobProgress,
} from './jobs/job-types.js';

// Export base processor
export { BaseProcessor } from './base-processor.js';

// Export job helpers
export {
  addBulkJob,
  addReportJob,
  addLocationJob,
  addSyncJob,
  getJob,
  getJobStatus,
  cancelJob,
  createJobResult,
  estimateCompletionTime,
  formatDuration,
  validateJobData,
  createJobOptions,
  batchItems,
  processItemsWithProgress,
  handleJobError,
} from './utils/job-helpers.js';
