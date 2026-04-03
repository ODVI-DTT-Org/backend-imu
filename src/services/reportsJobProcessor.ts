/**
 * Reports Job Processor
 *
 * Generates reports in background to avoid blocking API requests.
 */

import { pool } from '../db/index.js';
import {
  BackgroundJob,
  completeJob,
  failJob,
  JobProcessor,
} from './backgroundJob.js';
import { logger } from '../utils/logger.js';

interface ReportParams {
  report_type: string;
  start_date?: string;
  end_date?: string;
  user_id?: string;
  [key: string]: any;
}

interface ReportResult {
  report_type: string;
  generated_at: string;
  data: any;
}

/**
 * Generate agent performance report
 */
async function generateAgentPerformanceReport(params: ReportParams): Promise<any> {
  const { start_date, end_date } = params;

  const query = `
    SELECT
      u.id as user_id,
      u.first_name,
      u.last_name,
      u.role,
      COUNT(DISTINCT t.id) as total_touchpoints,
      COUNT(DISTINCT t.id) FILTER (
        WHERE t.type = 'Visit'
      ) as visit_count,
      COUNT(DISTINCT t.id) FILTER (
        WHERE t.type = 'Call'
      ) as call_count,
      COUNT(DISTINCT c.id) as total_clients,
      COUNT(DISTINCT c.id) FILTER (
        WHERE c.client_type = 'EXISTING'
      ) as existing_clients,
      COUNT(DISTINCT c.id) FILTER (
        WHERE c.client_type = 'POTENTIAL'
      ) as potential_clients
    FROM users u
    LEFT JOIN touchpoints t ON u.id = t.user_id
      AND ($3::date IS NULL OR t.created_at >= $3::date)
      AND ($4::date IS NULL OR t.created_at <= $4::date)
    LEFT JOIN clients c ON c.assigned_to = u.id
    WHERE u.role IN ('caravan', 'tele', 'admin')
      AND u.deleted_at IS NULL
    GROUP BY u.id, u.first_name, u.last_name, u.role
    ORDER BY total_touchpoints DESC
  `;

  const result = await pool.query(query, [start_date || null, end_date || null, start_date || null, end_date || null]);

  return {
    agents: result.rows,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Generate client activity report
 */
async function generateClientActivityReport(params: ReportParams): Promise<any> {
  const { start_date, end_date } = params;

  const query = `
    SELECT
      COUNT(*) as total_clients,
      COUNT(*) FILTER (WHERE client_type = 'EXISTING') as existing_clients,
      COUNT(*) FILTER (WHERE client_type = 'POTENTIAL') as potential_clients,
      COUNT(DISTINCT assigned_to) as active_agents,
      COUNT(DISTINCT t.id) as total_touchpoints,
      COUNT(DISTINCT t.id) FILTER (
        WHERE t.created_at >= NOW() - INTERVAL '7 days'
      ) as touchpoints_last_7_days,
      COUNT(DISTINCT t.id) FILTER (
        WHERE t.created_at >= NOW() - INTERVAL '30 days'
      ) as touchpoints_last_30_days
    FROM clients c
    LEFT JOIN touchpoints t ON c.id = t.client_id
      AND ($3::date IS NULL OR t.created_at >= $3::date)
      AND ($4::date IS NULL OR t.created_at <= $4::date)
    WHERE c.deleted_at IS NULL
  `;

  const result = await pool.query(query, [start_date || null, end_date || null, start_date || null, end_date || null]);

  return {
    ...result.rows[0],
    generated_at: new Date().toISOString(),
  };
}

/**
 * Generate touchpoint summary report
 */
async function generateTouchpointSummaryReport(params: ReportParams): Promise<any> {
  const { start_date, end_date } = params;

  const query = `
    SELECT
      type,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE status = 'Interested') as interested_count,
      COUNT(*) FILTER (WHERE status = 'Undecided') as undecided_count,
      COUNT(*) FILTER (WHERE status = 'Not Interested') as not_interested_count,
      COUNT(*) FILTER (WHERE status = 'Completed') as completed_count
    FROM touchpoints
    WHERE ($1::date IS NULL OR created_at >= $1::date)
      AND ($2::date IS NULL OR created_at <= $2::date)
    GROUP BY type
    ORDER BY type
  `;

  const result = await pool.query(query, [start_date || null, end_date || null]);

  return {
    by_type: result.rows,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Process report generation job
 */
export async function processReportGeneration(job: BackgroundJob): Promise<ReportResult> {
  const params = job.params as ReportParams;
  const { report_type } = params;

  logger.info('report-job', `Starting report generation job ${job.id} for type ${report_type}`);

  let data: any;

  switch (report_type) {
    case 'agent_performance':
      data = await generateAgentPerformanceReport(params);
      break;

    case 'client_activity':
      data = await generateClientActivityReport(params);
      break;

    case 'touchpoint_summary':
      data = await generateTouchpointSummaryReport(params);
      break;

    default:
      throw new Error(`Unknown report type: ${report_type}`);
  }

  logger.info('report-job', `Completed report generation for type ${report_type}`);

  return {
    report_type,
    generated_at: new Date().toISOString(),
    data,
  };
}

/**
 * Reports job processor
 */
export const reportsJobProcessor: JobProcessor = {
  type: 'report_generation',
  process: processReportGeneration,
};
