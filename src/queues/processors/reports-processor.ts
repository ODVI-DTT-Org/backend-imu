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
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { pool } from '../../db/index.js';
import { BaseProcessor } from '../base-processor.js';
import type { ReportJobData, JobResult } from '../jobs/job-types.js';
import { logger } from '../../utils/logger.js';
import { generateItineraryAnalysisReport } from './handlers/itinerary-analysis-handler.js';
import { generateDailyVisitsReport } from './handlers/daily-visits-handler.js';
import { generateDailyCallsReport } from './handlers/daily-calls-handler.js';
import { generateCaravanReleasesReport } from './handlers/caravan-releases-handler.js';
import { generateTeleReleasesReport } from './handlers/tele-releases-handler.js';
import { generateOdometerReport } from './handlers/odometer-handler.js';
import { generateReleasesByLoanTypeReport } from './handlers/releases-by-loan-type-handler.js';

/**
 * Builds a SQL expression that resolves a client's address with this priority:
 *   1. the client's primary address (from the addresses table)
 *   2. clients.full_address
 *   3. formatted PSGC "Region, Province, Mun/City, Brgy, Street"
 * `alias` must expose: id, full_address, region, province, municipality, barangay, street.
 */
function clientAddressSql(alias: string): string {
  return `UPPER(COALESCE(
    (SELECT NULLIF(TRIM(BOTH ', ' FROM CONCAT_WS(', ',
        NULLIF(COALESCE(a.street_address, a.street), ''),
        NULLIF(a.barangay, ''),
        NULLIF(a.city, ''),
        NULLIF(a.province, '')
     )), '')
     FROM addresses a
     WHERE a.client_id = ${alias}.id AND a.is_primary = TRUE AND a.deleted_at IS NULL
     LIMIT 1),
    NULLIF(${alias}.full_address, ''),
    NULLIF(TRIM(BOTH ', ' FROM CONCAT_WS(', ',
        NULLIF(${alias}.region, ''),
        NULLIF(${alias}.province, ''),
        NULLIF(${alias}.municipality, ''),
        NULLIF(${alias}.barangay, ''),
        NULLIF(${alias}.street, '')
     )), '')
  ))`;
}

/**
 * Full name as "LAST NAME, FIRST NAME MIDDLE NAME EXT", always UPPERCASE.
 * `alias` must expose: last_name, first_name, middle_name, ext_name.
 */
function clientFullNameSql(alias: string): string {
  return `UPPER(NULLIF(TRIM(BOTH ', ' FROM CONCAT_WS(', ',
    NULLIF(${alias}.last_name, ''),
    NULLIF(TRIM(CONCAT_WS(' ',
        NULLIF(${alias}.first_name, ''),
        NULLIF(${alias}.middle_name, ''),
        NULLIF(${alias}.ext_name, '')
    )), '')
  )), ''))`;
}

/** Agent (users) full name as "LAST NAME, FIRST NAME", always UPPERCASE. */
function userFullNameSql(alias: string): string {
  return `UPPER(NULLIF(TRIM(BOTH ', ' FROM CONCAT_WS(', ',
    NULLIF(${alias}.last_name, ''),
    NULLIF(${alias}.first_name, '')
  )), ''))`;
}

/**
 * Reports Processor
 */
export class ReportsProcessor extends BaseProcessor<ReportJobData, JobResult> {
  private s3Client: S3Client;
  private s3Bucket: string;

  constructor() {
    super('reports');
    // Align with the working StorageService bucket/region (the dedicated
    // AWS_S3_BUCKET / 'imu-reports' bucket does not exist in this environment).
    this.s3Bucket = process.env.STORAGE_BUCKET || process.env.AWS_S3_BUCKET || 'imu-uploads';
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'ap-southeast-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  private rowsToCsv(rows: Record<string, any>[], headers?: string[]): string {
    const resolvedHeaders = headers ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
    if (resolvedHeaders.length === 0) return '';
    const escape = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [
      resolvedHeaders.join(','),
      ...rows.map(r => resolvedHeaders.map(h => escape(r[h])).join(',')),
    ].join('\n');
  }

  private async uploadCsvToS3(fileName: string, csv: string): Promise<string> {
    const key = `reports/${fileName}`;
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: key,
      Body: Buffer.from(csv, 'utf-8'),
      ContentType: 'text/csv',
    }));
    return getSignedUrl(
      this.s3Client,
      new GetObjectCommand({ Bucket: this.s3Bucket, Key: key }),
      { expiresIn: 3600 }
    );
  }

  /**
   * Process report generation job
   */
  async process(job: Job<ReportJobData>): Promise<JobResult> {
    const { type, userId, params } = job.data;
    const startedAt = new Date();

    // Progress callback shared by all handlers
    const onProgress = async (pct: number, message: string) => {
      await this.updateProgress(job, { progress: pct, total: 100, current: pct, message });
    };

    await onProgress(5, 'Initializing report generation…');

    try {
      let result: any;

      switch (type) {
        case 'report_agent_performance':
          result = await this.generateAgentPerformanceReport(userId, params, onProgress);
          break;
        case 'report_client_activity':
          result = await this.generateClientActivityReport(userId, params, onProgress);
          break;
        case 'report_touchpoint_summary':
          result = await this.generateTouchpointSummaryReport(userId, params, onProgress);
          break;
        case 'report_attendance_summary':
          result = await this.generateAttendanceSummaryReport(userId, params, onProgress);
          break;
        case 'report_target_achievement':
          result = await this.generateTargetAchievementReport(userId, params, onProgress);
          break;
        case 'report_conversion':
          result = await this.generateConversionReport(userId, params, onProgress);
          break;
        case 'report_area_coverage':
          result = await this.generateAreaCoverageReport(userId, params, onProgress);
          break;
        case 'report_market_saturation':
          result = await this.generateMarketSaturationReport(userId, params, onProgress);
          break;
        case 'report_itinerary_analysis': {
          const from = params?.startDate ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
          const to   = params?.endDate   ?? new Date().toISOString().split('T')[0];

          const itineraryResult = await generateItineraryAnalysisReport(
            pool,
            this.s3Client,
            this.s3Bucket,
            from,
            to,
            onProgress
          );

          return {
            success: true,
            total: 1,
            succeeded: ['report_itinerary_analysis'],
            failed: [],
            startedAt,
            completedAt: new Date(),
            duration: Date.now() - startedAt.getTime(),
            result: {
              reportType: 'itinerary_analysis',
              format: 'excel',
              generatedAt: new Date(),
              parameters: { from, to },
              downloadUrl: itineraryResult.downloadUrl,
              fileName: itineraryResult.fileName,
              fileSize: itineraryResult.buffer.byteLength,
            },
          };
        }
        case 'report_daily_visits': {
          const from = params?.startDate ?? new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const to   = params?.endDate   ?? new Date().toISOString().split('T')[0];
          const r = await generateDailyVisitsReport(pool, this.s3Client, this.s3Bucket, {
            startDate: from, endDate: to, userId: params?.userId,
          }, onProgress);
          return {
            success: true, total: 1, succeeded: ['report_daily_visits'], failed: [],
            startedAt, completedAt: new Date(), duration: Date.now() - startedAt.getTime(),
            result: { reportType: 'daily_visits', format: 'excel', generatedAt: new Date(),
              parameters: { from, to }, downloadUrl: r.downloadUrl, fileName: r.fileName, fileSize: r.buffer.byteLength },
          };
        }
        case 'report_daily_calls': {
          const from = params?.startDate ?? new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const to   = params?.endDate   ?? new Date().toISOString().split('T')[0];
          const r = await generateDailyCallsReport(pool, this.s3Client, this.s3Bucket, {
            startDate: from, endDate: to, userId: params?.userId,
          }, onProgress);
          return {
            success: true, total: 1, succeeded: ['report_daily_calls'], failed: [],
            startedAt, completedAt: new Date(), duration: Date.now() - startedAt.getTime(),
            result: { reportType: 'daily_calls', format: 'excel', generatedAt: new Date(),
              parameters: { from, to }, downloadUrl: r.downloadUrl, fileName: r.fileName, fileSize: r.buffer.byteLength },
          };
        }
        case 'report_caravan_releases': {
          const from = params?.startDate ?? new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const to   = params?.endDate   ?? new Date().toISOString().split('T')[0];
          const r = await generateCaravanReleasesReport(pool, this.s3Client, this.s3Bucket, {
            startDate: from, endDate: to, userId: params?.userId,
            productType: params?.product_type, loanType: params?.loan_type, status: params?.status,
          }, onProgress);
          return {
            success: true, total: 1, succeeded: ['report_caravan_releases'], failed: [],
            startedAt, completedAt: new Date(), duration: Date.now() - startedAt.getTime(),
            result: { reportType: 'caravan_releases', format: 'excel', generatedAt: new Date(),
              parameters: { from, to, loanType: params?.loan_type, productType: params?.product_type, status: params?.status },
              downloadUrl: r.downloadUrl, fileName: r.fileName, fileSize: r.buffer.byteLength },
          };
        }
        case 'report_tele_releases': {
          const from = params?.startDate ?? new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const to   = params?.endDate   ?? new Date().toISOString().split('T')[0];
          const r = await generateTeleReleasesReport(pool, this.s3Client, this.s3Bucket, {
            startDate: from, endDate: to, userId: params?.userId,
            productType: params?.product_type, loanType: params?.loan_type, status: params?.status,
          }, onProgress);
          return {
            success: true, total: 1, succeeded: ['report_tele_releases'], failed: [],
            startedAt, completedAt: new Date(), duration: Date.now() - startedAt.getTime(),
            result: { reportType: 'tele_releases', format: 'excel', generatedAt: new Date(),
              parameters: { from, to, loanType: params?.loan_type, productType: params?.product_type, status: params?.status },
              downloadUrl: r.downloadUrl, fileName: r.fileName, fileSize: r.buffer.byteLength },
          };
        }
        case 'report_odometer': {
          const from = params?.startDate ?? new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const to   = params?.endDate   ?? new Date().toISOString().split('T')[0];
          const r = await generateOdometerReport(pool, this.s3Client, this.s3Bucket, {
            startDate: from, endDate: to, userId: params?.userId,
          }, onProgress);
          return {
            success: true, total: 1, succeeded: ['report_odometer'], failed: [],
            startedAt, completedAt: new Date(), duration: Date.now() - startedAt.getTime(),
            result: { reportType: 'odometer', format: 'excel', generatedAt: new Date(),
              parameters: { from, to }, downloadUrl: r.downloadUrl, fileName: r.fileName, fileSize: r.buffer.byteLength },
          };
        }
        case 'report_releases_by_loan_type': {
          const from = params?.startDate ?? new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const to   = params?.endDate   ?? new Date().toISOString().split('T')[0];
          const r = await generateReleasesByLoanTypeReport(pool, this.s3Client, this.s3Bucket, {
            startDate: from, endDate: to, userId: params?.userId,
            loanType: params?.loan_type, productType: params?.product_type,
          }, onProgress);
          return {
            success: true, total: 1, succeeded: ['report_releases_by_loan_type'], failed: [],
            startedAt, completedAt: new Date(), duration: Date.now() - startedAt.getTime(),
            result: { reportType: 'releases_by_loan_type', format: 'excel', generatedAt: new Date(),
              parameters: { from, to, loanType: params?.loan_type, productType: params?.product_type },
              downloadUrl: r.downloadUrl, fileName: r.fileName, fileSize: r.buffer.byteLength },
          };
        }
        default:
          throw new Error(`Unknown report type: ${type}`);
      }

      await onProgress(80, 'Uploading CSV…');

      let downloadUrl: string | undefined;
      try {
        const csv = this.rowsToCsv(result.data || [], result.csvHeaders);
        const fileName = `${type}-${Date.now()}.csv`;
        downloadUrl = await this.uploadCsvToS3(fileName, csv);
      } catch (uploadError: any) {
        logger.error('ReportsProcessor', 'CSV upload failed', uploadError);
        throw uploadError;
      }

      await onProgress(95, 'Finalizing…');

      // Strip the bulky `data` and `csvHeaders` arrays from the result we
      // persist to Redis — they've already been uploaded as the CSV and would
      // otherwise bloat the BullMQ payload (Market Saturation: 100k rows can
      // be tens of MB), risking silent truncation that loses the downloadUrl.
      const { data: _rows, csvHeaders: _hdr, ...resultMeta } = result;
      return {
        success: true,
        total: 1,
        succeeded: [type],
        failed: [],
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        result: {
          ...resultMeta,
          downloadUrl,
          rowCount: Array.isArray((result as any).data) ? (result as any).data.length : 0,
        },
      };
    } catch (error: any) {
      logger.error('ReportsProcessor', 'Report generation failed', error);
      throw error;
    }
  }

  /**
   * Generate agent performance report
   */
  private async generateAgentPerformanceReport(userId: string, params?: any, onProgress?: (pct: number, msg: string) => Promise<void>) {
    const { startDate, endDate, userId: targetUserId } = params || {};
    await onProgress?.(5, 'Preparing query…');

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

    await onProgress?.(20, 'Fetching data…');
    const result = await pool.query(
      `
      SELECT
        u.id as user_id,
        ${userFullNameSql('u')} as full_name,
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
    await onProgress?.(60, 'Processing rows…');

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
  private async generateClientActivityReport(userId: string, params?: any, onProgress?: (pct: number, msg: string) => Promise<void>) {
    const { startDate, endDate, municipality, province } = params || {};
    await onProgress?.(5, 'Preparing query…');

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

    await onProgress?.(20, 'Fetching data…');
    const result = await pool.query(
      `
      SELECT
        c.id as client_id,
        ${clientFullNameSql('c')} as full_name,
        c.first_name,
        c.last_name,
        c.municipality,
        c.province,
        ${clientAddressSql('c')} as full_address,
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
    await onProgress?.(60, 'Processing rows…');

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
  private async generateTouchpointSummaryReport(userId: string, params?: any, onProgress?: (pct: number, msg: string) => Promise<void>) {
    const { startDate, endDate } = params || {};
    await onProgress?.(5, 'Preparing query…');

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

    await onProgress?.(20, 'Fetching data…');
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
    await onProgress?.(60, 'Processing rows…');

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
  private async generateAttendanceSummaryReport(userId: string, params?: any, onProgress?: (pct: number, msg: string) => Promise<void>) {
    const { startDate, endDate, userId: targetUserId } = params || {};
    await onProgress?.(5, 'Preparing query…');

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

    await onProgress?.(20, 'Fetching data…');
    const result = await pool.query(
      `
      SELECT
        u.id as user_id,
        ${userFullNameSql('u')} as full_name,
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
    await onProgress?.(60, 'Processing rows…');

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
  private async generateTargetAchievementReport(userId: string, params?: any, onProgress?: (pct: number, msg: string) => Promise<void>) {
    const { startDate, endDate } = params || {};
    await onProgress?.(5, 'Preparing query…');

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

    await onProgress?.(20, 'Fetching data…');
    const result = await pool.query(
      `
      SELECT
        u.id as user_id,
        ${userFullNameSql('u')} as full_name,
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
    await onProgress?.(60, 'Processing rows…');

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
  private async generateConversionReport(userId: string, params?: any, onProgress?: (pct: number, msg: string) => Promise<void>) {
    const { startDate, endDate, municipality } = params || {};
    await onProgress?.(5, 'Preparing query…');

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

    await onProgress?.(20, 'Fetching data…');
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
    await onProgress?.(60, 'Processing rows…');

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
  private async generateAreaCoverageReport(userId: string, params?: any, onProgress?: (pct: number, msg: string) => Promise<void>) {
    const { startDate, endDate } = params || {};
    await onProgress?.(5, 'Preparing query…');

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

    await onProgress?.(20, 'Fetching data…');
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
    await onProgress?.(60, 'Processing rows…');

    return {
      reportType: 'area_coverage',
      generatedAt: new Date(),
      parameters: { startDate, endDate },
      data: result.rows,
    };
  }

  /**
   * Generate Market Saturation report.
   *
   * One row per active client, categorized as VIRGIN / FAVORABLE / OTHERS / EXISTING:
   *   EXISTING  = any release with status IN ('approved','released')
   *   VIRGIN    = no rows in visits
   *   FAVORABLE = latest visit reason in the seven team-defined FAVORABLE codes
   *   OTHERS    = otherwise
   *
   * EXISTING wins over visit-based categorization. The seven FAVORABLE codes are hard-coded
   * here, not joined from touchpoint_reasons.category (which lumps NOT_INTERESTED under
   * Unfavorable — incompatible with the team's MS definition).
   *
   * Filters (all optional, AND-composed):
   *   filters.team_ids   UUID[] — match the derived Assigned Team
   *   filters.categories TEXT[] — match the computed category
   *   filters.regions    TEXT[] — match clients.region
   *
   * SQL column aliases are Title-Case so rowsToCsv() emits the headers spelled the way
   * the existing Visits / Releases CSVs spell them.
   */
  private async generateMarketSaturationReport(_userId: string, params?: any, onProgress?: (pct: number, msg: string) => Promise<void>) {
    const filters = (params?.filters ?? {}) as {
      team_ids?: string[];
      categories?: string[];
      regions?: string[];
    };

    const teamIds = filters.team_ids && filters.team_ids.length > 0 ? filters.team_ids : null;
    const categories = filters.categories && filters.categories.length > 0 ? filters.categories : null;
    const regions = filters.regions && filters.regions.length > 0 ? filters.regions : null;

    await onProgress?.(5, 'Preparing query…');
    await onProgress?.(20, 'Fetching data…');
    const result = await pool.query(
      `
      WITH
        visit_agg AS (
          SELECT
            client_id,
            COUNT(*) AS visit_count,
            MIN(COALESCE(time_in, created_at)) AS first_visit_at,
            MAX(COALESCE(time_in, created_at)) AS last_visit_at
          FROM visits
          GROUP BY client_id
        ),
        latest_visit AS (
          SELECT DISTINCT ON (client_id)
            client_id,
            reason  AS last_reason,
            remarks AS last_remarks
          FROM visits
          ORDER BY client_id, COALESCE(time_in, created_at) DESC, id ASC
        ),
        latest_release AS (
          SELECT DISTINCT ON (client_id)
            client_id,
            COALESCE(approved_at, created_at) AS release_date,
            user_id   AS release_user_id,
            loan_type,
            udi_number
          FROM releases
          WHERE status IN ('approved', 'released')
          ORDER BY client_id, COALESCE(approved_at, created_at) DESC, id ASC
        ),
        has_call AS (
          SELECT DISTINCT client_id FROM calls
        ),
        assigned_group AS (
          SELECT DISTINCT ON (gm.province, gm.municipality)
            gm.province,
            gm.municipality,
            g.id          AS group_id,
            g.name        AS team_name,
            g.caravan_id
          FROM group_municipalities gm
          JOIN groups g ON g.id = gm.group_id
          ORDER BY gm.province, gm.municipality, g.created_at ASC
        ),
        release_user_group AS (
          SELECT DISTINCT ON (gm.client_id)
            gm.client_id AS user_id,
            g.name       AS team_name
          FROM group_members gm
          JOIN groups g ON g.id = gm.group_id
          ORDER BY gm.client_id, gm.joined_at ASC
        ),
        categorized AS (
          SELECT
            c.id,
            c.full_name,
            c.first_name,
            c.middle_name,
            c.last_name,
            c.ext_name,
            CASE
              WHEN lr.client_id IS NOT NULL                THEN 'EXISTING'
              WHEN va.client_id IS NULL                    THEN 'VIRGIN'
              WHEN lv.last_reason IN (
                'FOR_VERIFICATION','LOAN_INQUIRY','INTERESTED',
                'NOT_INTERESTED','UNDECIDED','NOT_AROUND','WITH_OTHER_LENDING'
              )                                            THEN 'FAVORABLE'
              ELSE                                              'OTHERS'
            END AS category,
            c.pension_type,
            c.product_type,
            c.region,
            c.province,
            c.municipality,
            c.barangay,
            c.street,
            c.full_address,
            c.phone,
            c.account_number,
            c.agency_name,
            c.created_at,
            va.first_visit_at,
            va.last_visit_at,
            va.visit_count,
            lv.last_reason,
            lv.last_remarks,
            lr.release_date,
            lr.release_user_id,
            lr.loan_type,
            lr.udi_number,
            CASE WHEN hc.client_id IS NOT NULL THEN 'Yes' ELSE 'No' END AS tele_endorsed,
            ag.caravan_id AS assigned_caravan_user_id,
            ag.team_name  AS assigned_team_name,
            rug.team_name AS lr_team_name
          FROM clients c
          LEFT JOIN visit_agg          va  ON va.client_id  = c.id
          LEFT JOIN latest_visit       lv  ON lv.client_id  = c.id
          LEFT JOIN latest_release     lr  ON lr.client_id  = c.id
          LEFT JOIN has_call           hc  ON hc.client_id  = c.id
          LEFT JOIN assigned_group     ag  ON ag.province     = c.province
                                          AND ag.municipality = c.municipality
          LEFT JOIN release_user_group rug ON rug.user_id     = lr.release_user_id
          WHERE c.deleted_at IS NULL
            AND c.status = 'active'
        )
      SELECT
        cat.id                                                     AS "ID",
        ${clientFullNameSql('cat')}                                AS "Full Name",
        cat.first_name                                             AS "First Name",
        cat.middle_name                                            AS "Middle Name",
        cat.last_name                                              AS "Last Name",
        cat.ext_name                                               AS "Ext Name",
        cat.category                                               AS "Category",
        cat.pension_type                                           AS "Pension Type",
        cat.product_type                                           AS "Product Type",
        cat.region                                                 AS "Region",
        cat.province                                               AS "Province",
        cat.municipality                                           AS "Municipality",
        cat.barangay                                               AS "Barangay",
        ${clientAddressSql('cat')}                                 AS "Full Address",
        ${clientAddressSql('cat')}                                 AS "Address",
        (ucar.first_name || ' ' || ucar.last_name)                 AS "Assigned Caravan",
        cat.assigned_team_name                                     AS "Assigned Team",
        TO_CHAR(cat.last_visit_at, 'YYYY-MM-DD"T"HH24:MI:SSOF')    AS "Last Visit Date",
        cat.last_reason                                            AS "Last Visit Reason",
        cat.last_remarks                                           AS "Last Visit Remarks",
        COALESCE(cat.visit_count, 0)                               AS "No. of Visits",
        CASE
          WHEN cat.first_visit_at IS NULL THEN NULL
          ELSE (EXTRACT(YEAR  FROM AGE(NOW(), cat.first_visit_at)) * 12
              + EXTRACT(MONTH FROM AGE(NOW(), cat.first_visit_at)))::INT
        END                                                        AS "Aging (months)",
        TO_CHAR(cat.release_date, 'YYYY-MM-DD"T"HH24:MI:SSOF')     AS "Release Date",
        (ulr.first_name || ' ' || ulr.last_name)                   AS "Release By",
        cat.lr_team_name                                           AS "LR Team",
        cat.loan_type                                              AS "Loan Type",
        cat.udi_number                                             AS "UDI Number",
        cat.tele_endorsed                                          AS "Tele Endorsed",
        cat.phone                                                  AS "Contact Number",
        cat.account_number                                         AS "Account Number",
        cat.agency_name                                            AS "Agency Name",
        TO_CHAR(cat.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF')       AS "Created At"
      FROM categorized cat
      LEFT JOIN users ucar ON ucar.id = cat.assigned_caravan_user_id
      LEFT JOIN users ulr  ON ulr.id  = cat.release_user_id
      WHERE
        ($1::uuid[] IS NULL OR cat.assigned_team_name IN (
            SELECT name FROM groups WHERE id = ANY($1)))
        AND ($2::text[] IS NULL OR cat.category = ANY($2))
        AND ($3::text[] IS NULL OR cat.region   = ANY($3))
      ORDER BY "Full Name" ASC, "ID" ASC
      LIMIT 100000
      `,
      [teamIds, categories, regions]
    );
    await onProgress?.(60, 'Processing rows…');

    return {
      reportType: 'market_saturation',
      generatedAt: new Date(),
      parameters: { teamIds, categories, regions },
      csvHeaders: [
        'ID',
        'Full Name',
        'First Name',
        'Middle Name',
        'Last Name',
        'Ext Name',
        'Category',
        'Pension Type',
        'Product Type',
        'Region',
        'Province',
        'Municipality',
        'Barangay',
        'Full Address',
        'Address',
        'Assigned Caravan',
        'Assigned Team',
        'Last Visit Date',
        'Last Visit Reason',
        'Last Visit Remarks',
        'No. of Visits',
        'Aging (months)',
        'Release Date',
        'Release By',
        'LR Team',
        'Loan Type',
        'UDI Number',
        'Tele Endorsed',
        'Contact Number',
        'Account Number',
        'Agency Name',
        'Created At',
      ],
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
