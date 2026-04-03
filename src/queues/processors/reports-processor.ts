/**
 * Reports Processor
 *
 * Handles report generation jobs including:
 * - Agent performance reports
 * - Client activity reports
 * - Touchpoint summary reports
 * - Attendance summary reports
 * - Target achievement reports
 * - Conversion reports
 * - Area coverage reports
 */

import { Job } from 'bullmq';
import { pool } from '../../db/index.js';
import { BaseProcessor } from '../base-processor.js';
import type { ReportJobData, JobResult } from '../jobs/job-types.js';
import { logger } from '../../utils/logger.js';

/**
 * Reports Processor
 */
export class ReportsProcessor extends BaseProcessor<ReportJobData, JobResult> {
  constructor() {
    super('reports');
  }

  /**
   * Process report generation job
   */
  async process(job: Job<ReportJobData>): Promise<JobResult> {
    const { type, userId, params } = job.data;
    const startedAt = new Date();

    // Update progress
    await this.updateProgress(job, {
      progress: 10,
      total: 100,
      current: 0,
      message: 'Initializing report generation...',
    });

    try {
      let result: any;

      switch (type) {
        case 'report_agent_performance':
          result = await this.generateAgentPerformanceReport(userId, params);
          break;
        case 'report_client_activity':
          result = await this.generateClientActivityReport(userId, params);
          break;
        case 'report_touchpoint_summary':
          result = await this.generateTouchpointSummaryReport(userId, params);
          break;
        case 'report_attendance_summary':
          result = await this.generateAttendanceSummaryReport(userId, params);
          break;
        case 'report_target_achievement':
          result = await this.generateTargetAchievementReport(userId, params);
          break;
        case 'report_conversion':
          result = await this.generateConversionReport(userId, params);
          break;
        case 'report_area_coverage':
          result = await this.generateAreaCoverageReport(userId, params);
          break;
        default:
          throw new Error(`Unknown report type: ${type}`);
      }

      await this.updateProgress(job, {
        progress: 100,
        total: 100,
        current: 100,
        message: 'Report generation complete',
      });

      return {
        success: true,
        total: 1,
        succeeded: [type],
        failed: [],
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        result,
      };
    } catch (error: any) {
      logger.error('ReportsProcessor', 'Report generation failed', error);
      throw error;
    }
  }

  /**
   * Generate agent performance report
   */
  private async generateAgentPerformanceReport(userId: string, params?: any) {
    const { startDate, endDate, userId: targetUserId } = params || {};

    // Build query conditions
    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (targetUserId) {
      conditions.push(`t.user_id = $${paramIndex}`);
      queryParams.push(targetUserId);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`t.date >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`t.date <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.role,
        COUNT(t.id) as total_touchpoints,
        COUNT(t.id) FILTER (WHERE t.status = 'Completed') as completed_touchpoints,
        COUNT(t.id) FILTER (WHERE t.status = 'Interested') as interested_count,
        COUNT(t.id) FILTER (WHERE t.status = 'Not Interested') as not_interested_count,
        COUNT(DISTINCT t.client_id) as unique_clients,
        MIN(t.date) as first_touchpoint,
        MAX(t.date) as last_touchpoint
      FROM users u
      LEFT JOIN touchpoints t ON u.id = t.user_id
      ${whereClause}
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY completed_touchpoints DESC
      `,
      queryParams
    );

    return {
      reportType: 'agent_performance',
      generatedAt: new Date(),
      parameters: { startDate, endDate, targetUserId },
      data: result.rows,
    };
  }

  /**
   * Generate client activity report
   */
  private async generateClientActivityReport(userId: string, params?: any) {
    const { startDate, endDate, municipality, province } = params || {};

    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`t.date >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`t.date <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    if (municipality) {
      conditions.push(`c.municipality = $${paramIndex}`);
      queryParams.push(municipality);
      paramIndex++;
    }

    if (province) {
      conditions.push(`c.province = $${paramIndex}`);
      queryParams.push(province);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        c.id as client_id,
        c.first_name,
        c.last_name,
        c.municipality,
        c.province,
        c.client_type,
        COUNT(t.id) as total_touchpoints,
        COUNT(t.id) FILTER (WHERE t.status = 'Completed') as completed_touchpoints,
        MAX(t.date) as last_activity,
        MAX(t.created_at) FILTER (WHERE t.status = 'Completed') as last_conversion
      FROM clients c
      LEFT JOIN touchpoints t ON c.id = t.client_id
      ${whereClause}
      GROUP BY c.id, c.first_name, c.last_name, c.municipality, c.province, c.client_type
      ORDER BY last_activity DESC NULLS LAST
      `,
      queryParams
    );

    return {
      reportType: 'client_activity',
      generatedAt: new Date(),
      parameters: { startDate, endDate, municipality, province },
      data: result.rows,
    };
  }

  /**
   * Generate touchpoint summary report
   */
  private async generateTouchpointSummaryReport(userId: string, params?: any) {
    const { startDate, endDate } = params || {};

    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`t.date >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`t.date <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        t.touchpoint_number,
        t.type,
        t.status,
        COUNT(*) as count,
        COUNT(DISTINCT t.user_id) as unique_agents,
        COUNT(DISTINCT t.client_id) as unique_clients
      FROM touchpoints t
      ${whereClause}
      GROUP BY t.touchpoint_number, t.type, t.status
      ORDER BY t.touchpoint_number, t.type, t.status
      `,
      queryParams
    );

    return {
      reportType: 'touchpoint_summary',
      generatedAt: new Date(),
      parameters: { startDate, endDate },
      data: result.rows,
    };
  }

  /**
   * Generate attendance summary report
   */
  private async generateAttendanceSummaryReport(userId: string, params?: any) {
    const { startDate, endDate, userId: targetUserId } = params || {};

    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (targetUserId) {
      conditions.push(`a.user_id = $${paramIndex}`);
      queryParams.push(targetUserId);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`a.date >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`a.date <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.role,
        COUNT(a.id) as total_days,
        COUNT(a.id) FILTER (WHERE a.status = 'present') as days_present,
        COUNT(a.id) FILTER (WHERE a.status = 'absent') as days_absent,
        COUNT(a.id) FILTER (WHERE a.status = 'late') as days_late,
        ROUND(COUNT(a.id) FILTER (WHERE a.status = 'present')::numeric / NULLIF(COUNT(a.id), 0) * 100, 2) as attendance_rate
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id
      ${whereClause}
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY attendance_rate DESC NULLS LAST
      `,
      queryParams
    );

    return {
      reportType: 'attendance_summary',
      generatedAt: new Date(),
      parameters: { startDate, endDate, targetUserId },
      data: result.rows,
    };
  }

  /**
   * Generate target achievement report
   */
  private async generateTargetAchievementReport(userId: string, params?: any) {
    const { startDate, endDate } = params || {};

    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`t.date >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`t.date <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.role,
        COUNT(t.id) FILTER (WHERE t.status = 'Completed') as conversions,
        COALESCE(targets.monthly_target, 50) as target,
        ROUND(COUNT(t.id) FILTER (WHERE t.status = 'Completed')::numeric / NULLIF(targets.monthly_target, 50) * 100, 2) as achievement_percentage
      FROM users u
      LEFT JOIN touchpoints t ON u.id = t.user_id
      LEFT JOIN user_targets targets ON u.id = targets.user_id
      ${whereClause}
      GROUP BY u.id, u.first_name, u.last_name, u.role, targets.monthly_target
      ORDER BY achievement_percentage DESC NULLS LAST
      `,
      queryParams
    );

    return {
      reportType: 'target_achievement',
      generatedAt: new Date(),
      parameters: { startDate, endDate },
      data: result.rows,
    };
  }

  /**
   * Generate conversion report
   */
  private async generateConversionReport(userId: string, params?: any) {
    const { startDate, endDate, municipality } = params || {};

    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`t.date >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`t.date <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    if (municipality) {
      conditions.push(`c.municipality = $${paramIndex}`);
      queryParams.push(municipality);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        c.municipality,
        COUNT(DISTINCT c.id) as total_clients,
        COUNT(DISTINCT c.id) FILTER (WHERE EXISTS (
          SELECT 1 FROM touchpoints t2 WHERE t2.client_id = c.id AND t2.status = 'Completed'
        )) as converted_clients,
        ROUND(COUNT(DISTINCT c.id) FILTER (WHERE EXISTS (
          SELECT 1 FROM touchpoints t2 WHERE t2.client_id = c.id AND t2.status = 'Completed'
        ))::numeric / NULLIF(COUNT(DISTINCT c.id), 0) * 100, 2) as conversion_rate
      FROM clients c
      LEFT JOIN touchpoints t ON c.id = t.client_id
      ${whereClause}
      GROUP BY c.municipality
      ORDER BY conversion_rate DESC NULLS LAST
      `,
      queryParams
    );

    return {
      reportType: 'conversion',
      generatedAt: new Date(),
      parameters: { startDate, endDate, municipality },
      data: result.rows,
    };
  }

  /**
   * Generate area coverage report
   */
  private async generateAreaCoverageReport(userId: string, params?: any) {
    const { startDate, endDate } = params || {};

    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`t.date >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`t.date <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        c.province,
        c.municipality,
        COUNT(DISTINCT c.id) as total_clients,
        COUNT(DISTINCT t.id) as total_touchpoints,
        COUNT(DISTINCT t.user_id) as agents_active
      FROM clients c
      LEFT JOIN touchpoints t ON c.id = t.client_id
      ${whereClause}
      GROUP BY c.province, c.municipality
      ORDER BY c.province, c.municipality
      `,
      queryParams
    );

    return {
      reportType: 'area_coverage',
      generatedAt: new Date(),
      parameters: { startDate, endDate },
      data: result.rows,
    };
  }

  /**
   * Override concurrency for reports
   */
  protected getConcurrency(): number {
    return parseInt(process.env.QUEUE_CONCURRENCY_REPORTS || '3');
  }
}

/**
 * Export singleton instance getter
 */
export const reportsProcessor = new ReportsProcessor();
