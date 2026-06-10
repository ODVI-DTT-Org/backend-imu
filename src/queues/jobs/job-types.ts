/**
 * BullMQ Job Type Definitions
 *
 * Defines all job types for the queuing system across different queues.
 */

/**
 * Bulk Operations Queue Job Types
 * For bulk deletes, bulk approvals, and other bulk operations
 */
export enum BulkJobType {
  // Bulk Deletes
  BULK_DELETE_USERS = 'bulk_delete_users',
  BULK_DELETE_GROUPS = 'bulk_delete_groups',
  BULK_DELETE_CARAVANS = 'bulk_delete_caravans',
  BULK_DELETE_ITINERARIES = 'bulk_delete_itineraries',
  BULK_DELETE_MY_DAY = 'bulk_delete_my_day',
  BULK_DELETE_CLIENTS = 'bulk_delete_clients',
  BULK_DELETE_TOUCHPOINTS = 'bulk_delete_touchpoints',

  // Bulk Approvals
  BULK_APPROVE = 'bulk_approve',
  BULK_REJECT = 'bulk_reject',

  // Bulk Upload
  BULK_UPLOAD_CLIENTS = 'bulk_upload_clients',
}

/**
 * Reports Queue Job Types
 * For report generation and CSV exports
 */
export enum ReportJobType {
  // Performance Reports
  REPORT_AGENT_PERFORMANCE = 'report_agent_performance',
  REPORT_CLIENT_ACTIVITY = 'report_client_activity',
  REPORT_TOUCHPOINT_SUMMARY = 'report_touchpoint_summary',

  // Summary Reports
  REPORT_ATTENDANCE_SUMMARY = 'report_attendance_summary',
  REPORT_TARGET_ACHIEVEMENT = 'report_target_achievement',
  REPORT_CONVERSION = 'report_conversion',
  REPORT_AREA_COVERAGE = 'report_area_coverage',
  REPORT_MARKET_SATURATION = 'report_market_saturation',
  REPORT_ITINERARY_ANALYSIS = 'report_itinerary_analysis',

  // CSV Exports
  EXPORT_TOUCHPOINTS_CSV = 'export_touchpoints_csv',
  EXPORT_CLIENTS_CSV = 'export_clients_csv',
  EXPORT_ATTENDANCE_CSV = 'export_attendance_csv',

  // Excel Reports (Executive Dashboard)
  EXCEL_EXECUTIVE_DASHBOARD = 'excel_executive_dashboard',
  EXCEL_QUICK_REPORT = 'excel_quick_report',
  EXCEL_CUSTOM_REPORT = 'excel_custom_report',
  EXCEL_SCHEDULED_REPORT = 'excel_scheduled_report',

  // Queued XLSX exports for sync report endpoints
  REPORT_DAILY_VISITS = 'report_daily_visits',
  REPORT_DAILY_CALLS = 'report_daily_calls',
  REPORT_CARAVAN_RELEASES = 'report_caravan_releases',
  REPORT_TELE_RELEASES = 'report_tele_releases',
  REPORT_ODOMETER = 'report_odometer',
  REPORT_RELEASES_BY_LOAN_TYPE = 'report_releases_by_loan_type',
  REPORT_TOUCHPOINTS_TO_RELEASE = 'report_touchpoints_to_release',
}

/**
 * Location Assignments Queue Job Types
 * For PSGC matching and municipality assignments
 */
export enum LocationJobType {
  // PSGC Matching
  PSGC_MATCHING = 'psgc_matching',

  // Bulk Assignments
  BULK_ASSIGN_USER_PSGC = 'bulk_assign_user_psgc',
  BULK_ASSIGN_USER_MUNICIPALITIES = 'bulk_assign_user_municipalities',
  BULK_ASSIGN_GROUP_MUNICIPALITIES = 'bulk_assign_group_municipalities',
  BULK_ASSIGN_CARAVAN_MUNICIPALITIES = 'bulk_assign_caravan_municipalities',
}

/**
 * Sync Operations Queue Job Types
 * For PowerSync batch operations from mobile app
 */
export enum SyncJobType {
  POWERSYNC_BATCH = 'powersync_batch',
}

/**
 * Geocoding Queue Job Types
 * For forward-geocoding client addresses to lat/lng
 */
export enum GeocodingJobType {
  GEOCODE_CLIENTS = 'geocode_clients',
}

/**
 * All job types union
 */
export type JobType = BulkJobType | ReportJobType | LocationJobType | SyncJobType | GeocodingJobType;

/**
 * Queue Names
 */
export const QUEUE_NAMES = {
  BULK_OPERATIONS: 'bulk-operations',
  REPORTS: 'reports',
  CSV_EXPORTS: 'csv-exports',
  LOCATION_ASSIGNMENTS: 'location-assignments',
  SYNC_OPERATIONS: 'sync-operations',
  BULK_UPLOAD: 'bulk-upload',
  GEOCODING: 'geocoding',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

/**
 * Job Status
 */
export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Base job data interface
 */
export interface BaseJobData {
  userId: string;
  requestId?: string;
}

/**
 * Bulk job data interface
 */
export interface BulkJobData extends BaseJobData {
  type: BulkJobType | LocationJobType;
  items: string[];
  params?: Record<string, any>;
}

/**
 * Report job data interface
 */
export interface ReportJobData extends BaseJobData {
  type: ReportJobType;
  reportType: string;
  params?: {
    startDate?: string;
    endDate?: string;
    userId?: string;
    municipality?: string;
    province?: string;
    clientType?: string;
    format?: 'json' | 'csv' | 'excel';
    // Excel-specific parameters
    reportMode?: 'quick' | 'custom' | 'scheduled';
    sheets?: string[];
    columns?: string[];
    filters?: Record<string, any>;
    scheduledReportId?: string;
    recipients?: string[];
    // Filters for queued XLSX report handlers
    loan_type?: string;
    product_type?: string;
    status?: string;
    // Filters for itinerary analysis
    group_ids?: string[];
    user_ids?: string[];
    reason_category?: string;
  };
}

/**
 * Sync job data interface
 */
export interface SyncJobData extends BaseJobData {
  type: SyncJobType;
  operations: Array<{
    type: 'put' | 'delete' | 'patch';
    table: string;
    data: any;
  }>;
}

/**
 * Individual client row for bulk upload
 */
export interface BulkUploadClientRow {
  last_name: string
  first_name: string
  middle_name?: string
  ext_name?: string
  pension_type: string
  client_type?: string
  product_type?: string
  market_type?: string
  phone?: string
  email?: string
  birth_date?: string
  province?: string
  municipality?: string
  barangay?: string
  pan?: string
  facebook_link?: string
  remarks?: string
  rank?: string
  account_number?: string
  atm_number?: string
  unit_code?: string
  _originalRow: Record<string, string>
  _rowNumber: number
}

/**
 * Job data for bulk client upload
 */
export interface BulkUploadJobData extends BaseJobData {
  rows: BulkUploadClientRow[]
  userRole: string
}

/**
 * Result type for bulk upload job
 */
export interface BulkUploadJobResult {
  successful: Array<BulkUploadClientRow & { id: string }>
  failed: Array<BulkUploadClientRow & { error: string }>
}

/**
 * Geocoding job data interface
 */
export interface GeocodingJobData extends BaseJobData {
  type: GeocodingJobType;
  clientId?: string; // if set, geocode this single client; if absent, batch-process all pending
}

/**
 * Job result interface
 */
export interface JobResult {
  success: boolean;
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
  startedAt: Date;
  completedAt: Date;
  duration: number; // milliseconds
  result?: any; // Additional result data
}

/**
 * Job progress interface
 */
export interface JobProgress {
  progress: number; // 0-100
  total: number;
  current: number;
  message?: string;
  succeeded?: string[];
  failed?: Array<{ id: string; error: string }>;
}
