/**
 * Excel Reports Processor
 *
 * Handles Excel report generation jobs including:
 * - Executive Dashboard Excel reports
 * - Quick Excel reports (preset configurations)
 * - Custom Excel reports (user-selected columns and filters)
 * - Scheduled Excel reports (recurring reports)
 */

import { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import { pool } from '../../db/index.js';
import { BaseProcessor } from '../base-processor.js';
import type { ReportJobData, JobResult } from '../jobs/job-types.js';
import { logger } from '../../utils/logger.js';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Excel Reports Processor
 */
export class ExcelReportsProcessor extends BaseProcessor<ReportJobData, JobResult> {
  private s3Client: S3Client;
  private s3Bucket: string;

  constructor() {
    super('excel-reports');
    this.s3Bucket = process.env.AWS_S3_BUCKET || 'imu-reports';
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  /**
   * Process Excel report generation job
   */
  async process(job: Job<ReportJobData>): Promise<JobResult> {
    const { type, userId, params } = job.data;
    const startedAt = new Date();

    // Update progress
    await this.updateProgress(job, {
      progress: 10,
      total: 100,
      current: 0,
      message: 'Initializing Excel generation...',
    });

    try {
      let result: any;

      switch (type) {
        case 'excel_executive_dashboard':
          result = await this.generateExecutiveDashboardExcel(userId, params, job);
          break;
        case 'excel_quick_report':
          result = await this.generateQuickReportExcel(userId, params, job);
          break;
        case 'excel_custom_report':
          result = await this.generateCustomReportExcel(userId, params, job);
          break;
        case 'excel_scheduled_report':
          result = await this.generateScheduledReportExcel(userId, params, job);
          break;
        default:
          throw new Error(`Unknown Excel report type: ${type}`);
      }

      await this.updateProgress(job, {
        progress: 100,
        total: 100,
        current: 100,
        message: 'Excel generation complete',
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
      logger.error('ExcelReportsProcessor', 'Excel generation failed', error);
      throw error;
    }
  }

  /**
   * Generate Executive Dashboard Excel report
   * Contains 4 sheets: Executive Summary, Detailed Data, Charts, Methodology
   */
  private async generateExecutiveDashboardExcel(userId: string, params?: any, job?: Job<ReportJobData>) {
    const { startDate, endDate } = params || {};

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IMU System';
    workbook.created = new Date();

    // Update progress
    if (job) {
      await this.updateProgress(job, {
        progress: 20,
        total: 100,
        current: 1,
        message: 'Fetching KPI data...',
      });
    }

    // Fetch KPI data
    const kpiData = await this.fetchDashboardKPIs(startDate, endDate);

    // Create sheets
    await this.createExecutiveSummarySheet(workbook, kpiData);
    await this.createDetailedDataSheet(workbook, kpiData);
    await this.createChartsSheet(workbook, kpiData);
    await this.createMethodologySheet(workbook);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer() as unknown as Buffer;

    // Upload to S3
    const fileName = `executive-dashboard-${Date.now()}.xlsx`;
    const fileUrl = await this.uploadToS3(fileName, buffer);

    // Update database
    await this.updateReportJobRecord(userId, 'executive_dashboard', fileUrl, buffer.byteLength);

    return {
      reportType: 'executive_dashboard',
      format: 'excel',
      generatedAt: new Date(),
      parameters: { startDate, endDate },
      fileUrl,
      fileName,
      fileSize: buffer.byteLength,
      sheets: ['Executive Summary', 'Detailed Data', 'Charts', 'Methodology'],
    };
  }

  /**
   * Generate Quick Report Excel (preset configuration)
   */
  private async generateQuickReportExcel(userId: string, params?: any, job?: Job<ReportJobData>) {
    const { reportType = 'performance', startDate, endDate } = params || {};

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IMU System';
    workbook.created = new Date();

    if (job) {
      await this.updateProgress(job, {
        progress: 20,
        total: 100,
        current: 1,
        message: `Fetching ${reportType} data...`,
      });
    }

    // Fetch report data based on type
    const data = await this.fetchQuickReportData(reportType, startDate, endDate);

    // Create single sheet with data
    const worksheet = workbook.addWorksheet('Report');

    // Add headers
    const headers = Object.keys(data[0] || {});
    worksheet.addRow(headers);

    // Add data rows
    data.forEach(row => {
      worksheet.addRow(Object.values(row));
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (column.header) {
        const maxLength = column.values?.reduce((max: number, value) => {
          return Math.max(max, String(value).length);
        }, 10) || 10;
        column.width = maxLength < 20 ? 20 : maxLength;
      }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer() as unknown as Buffer;
    const fileName = `quick-${reportType}-${Date.now()}.xlsx`;
    const fileUrl = await this.uploadToS3(fileName, buffer);

    await this.updateReportJobRecord(userId, 'quick', fileUrl, buffer.byteLength);

    return {
      reportType: 'quick',
      format: 'excel',
      generatedAt: new Date(),
      parameters: { reportType, startDate, endDate },
      fileUrl,
      fileName,
      fileSize: buffer.byteLength,
      sheets: ['Report'],
    };
  }

  /**
   * Generate Custom Report Excel (user-selected configuration)
   */
  private async generateCustomReportExcel(userId: string, params?: any, job?: Job<ReportJobData>) {
    const { sheets = [], columns = [], filters = {}, startDate, endDate } = params || {};

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IMU System';
    workbook.created = new Date();

    if (job) {
      await this.updateProgress(job, {
        progress: 20,
        total: 100,
        current: 1,
        message: 'Fetching custom report data...',
      });
    }

    // Fetch custom report data
    const data = await this.fetchCustomReportData(sheets, columns, filters, startDate, endDate);

    // Create sheets based on user selection
    for (const sheetConfig of sheets) {
      const worksheet = workbook.addWorksheet(sheetConfig.name);
      const sheetData = data[sheetConfig.name] || [];

      // Add headers
      const sheetColumns = columns[sheetConfig.name] || Object.keys(sheetData[0] || {});
      worksheet.addRow(sheetColumns);

      // Add data
      sheetData.forEach(row => {
        worksheet.addRow(sheetColumns.map((col: string) => row[col]));
      });

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        if (column.header) {
          const maxLength = column.values?.reduce((max: number, value) => {
            return Math.max(max, String(value).length);
          }, 10) || 10;
          column.width = maxLength < 15 ? 15 : maxLength;
        }
      });
    }

    const buffer = await workbook.xlsx.writeBuffer() as unknown as Buffer;
    const fileName = `custom-${Date.now()}.xlsx`;
    const fileUrl = await this.uploadToS3(fileName, buffer);

    await this.updateReportJobRecord(userId, 'custom', fileUrl, buffer.byteLength);

    return {
      reportType: 'custom',
      format: 'excel',
      generatedAt: new Date(),
      parameters: { sheets, columns, filters },
      fileUrl,
      fileName,
      fileSize: buffer.byteLength,
      sheets: sheets.map((s: any) => s.name),
    };
  }

  /**
   * Generate Scheduled Report Excel
   */
  private async generateScheduledReportExcel(userId: string, params?: any, job?: Job<ReportJobData>) {
    const { scheduledReportId, recipients = [], ...reportParams } = params || {};

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IMU System';
    workbook.created = new Date();

    if (job) {
      await this.updateProgress(job, {
        progress: 20,
        total: 100,
        current: 1,
        message: 'Generating scheduled report...',
      });
    }

    // Get scheduled report configuration
    const scheduleResult = await pool.query(
      'SELECT * FROM scheduled_reports WHERE id = $1 AND is_active = true',
      [scheduledReportId]
    );

    if (scheduleResult.rows.length === 0) {
      throw new Error('Scheduled report not found or inactive');
    }

    const scheduleConfig = scheduleResult.rows[0];
    const scheduleParams = scheduleConfig.params || {};

    // Generate report using schedule configuration
    const result = await this.generateCustomReportExcel(userId, {
      ...scheduleParams,
      ...reportParams,
    }, job);

    // Update last_run_at for scheduled report
    await pool.query(
      'UPDATE scheduled_reports SET last_run_at = NOW() WHERE id = $1',
      [scheduledReportId]
    );

    // Send email notification to recipients
    if (recipients.length > 0) {
      await this.sendReportEmail(recipients, result.fileUrl, scheduleConfig.name);
    }

    return {
      ...result,
      reportType: 'scheduled',
      scheduledReportId,
      recipients,
    };
  }

  /**
   * Fetch KPI data for Executive Dashboard
   */
  private async fetchDashboardKPIs(startDate?: string, endDate?: string) {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`DATE(created_at) >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`DATE(created_at) <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // KPI 1: New clients acquired (weekly)
    const newClientsResult = await pool.query(
      `
      SELECT
        COUNT(*) as count,
        EXTRACT(WEEK FROM created_at) as week,
        EXTRACT(YEAR FROM created_at) as year
      FROM clients
      ${whereClause}
      GROUP BY week, year
      ORDER BY year DESC, week DESC
      LIMIT 4
      `,
      params
    );

    // KPI 2: Visits completion rate
    const completionResult = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'Completed') as completed,
        COUNT(*) as total,
        ROUND(COUNT(*) FILTER (WHERE status = 'Completed')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as completion_rate
      FROM touchpoints
      ${whereClause}
      `,
      params
    );

    // KPI 3: Loans released (monthly)
    const loansResult = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE loan_released = true) as loans_released,
        COUNT(*) as total_clients,
        ROUND(COUNT(*) FILTER (WHERE loan_released = true)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as release_rate
      FROM clients
      ${whereClause}
      `,
      params
    );

    // KPI 4: Underserved municipalities
    const municipalitiesResult = await pool.query(
      `
      SELECT
        DISTINCT municipality,
        province,
        COUNT(DISTINCT c.id) as client_count
      FROM clients c
      LEFT JOIN user_locations ul ON c.municipality = ul.municipality AND c.province = ul.province
      ${whereClause}
      GROUP BY municipality, province
      HAVING COUNT(DISTINCT ul.user_id) = 0
      ORDER BY client_count DESC
      LIMIT 10
      `,
      params
    );

    // KPI 5: Top/Bottom performing agents
    const agentsResult = await pool.query(
      `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.role,
        COUNT(t.id) FILTER (WHERE t.status = 'Completed') as completed_touchpoints,
        COUNT(DISTINCT t.client_id) as unique_clients
      FROM users u
      LEFT JOIN touchpoints t ON u.id = t.user_id
      ${whereClause}
      GROUP BY u.id, u.first_name, u.last_name, u.role
      HAVING COUNT(t.id) > 0
      ORDER BY completed_touchpoints DESC
      LIMIT 20
      `,
      params
    );

    return {
      newClients: newClientsResult.rows,
      completion: completionResult.rows[0],
      loans: loansResult.rows[0],
      underservedMunicipalities: municipalitiesResult.rows,
      agents: agentsResult.rows,
    };
  }

  /**
   * Create Executive Summary sheet
   */
  private async createExecutiveSummarySheet(workbook: ExcelJS.Workbook, kpiData: any) {
    const worksheet = workbook.addWorksheet('Executive Summary');

    // Add title
    worksheet.mergeCells('A1:E1');
    worksheet.getCell('A1').value = 'IMU Executive Dashboard';
    worksheet.getCell('A1').font = { size: 20, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add date
    worksheet.mergeCells('A2:E2');
    worksheet.getCell('A2').value = `Generated: ${new Date().toLocaleString()}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    let row = 4;

    // KPI 1: New Clients
    worksheet.getCell(`A${row}`).value = 'New Clients Acquired';
    worksheet.getCell(`A${row}`).font = { bold: true };
    const weeklyNewClients = kpiData.newClients.map((r: any) => r.count).reduce((a: number, b: number) => a + b, 0);
    worksheet.getCell(`B${row}`).value = weeklyNewClients;
    worksheet.getCell(`B${row}`).font = { bold: true, color: { argb: 'FF00AA00' } };
    row++;

    // KPI 2: Completion Rate
    worksheet.getCell(`A${row}`).value = 'Visits Completion Rate';
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).value = `${kpiData.completion.completion_rate}%`;
    worksheet.getCell(`B${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).numFmt = '0.00';
    row++;

    // KPI 3: Loans Released
    worksheet.getCell(`A${row}`).value = 'Loans Released (Monthly)';
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).value = `${kpiData.loans.release_rate}%`;
    worksheet.getCell(`B${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).numFmt = '0.00';
    row++;

    // KPI 4: Underserved Municipalities
    worksheet.getCell(`A${row}`).value = 'Underserved Municipalities';
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).value = kpiData.underservedMunicipalities.length;
    row++;

    // KPI 5: Top Performers
    worksheet.getCell(`A${row}`).value = 'Top Performing Agents';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    kpiData.agents.slice(0, 5).forEach((agent: any, index: number) => {
      worksheet.getCell(`A${row + index}`).value = `${agent.first_name} ${agent.last_name}`;
      worksheet.getCell(`B${row + index}`).value = agent.completed_touchpoints;
    });
  }

  /**
   * Create Detailed Data sheet
   */
  private async createDetailedDataSheet(workbook: ExcelJS.Workbook, kpiData: any) {
    const worksheet = workbook.addWorksheet('Detailed Data');

    // Add headers
    worksheet.addRow(['KPI', 'Metric', 'Value', 'Trend']);

    // Add data
    let row = 2;

    // New Clients
    worksheet.getCell(`A${row}`).value = 'New Clients';
    worksheet.getCell(`B${row}`).value = 'Weekly Count';
    worksheet.getCell(`C${row}`).value = kpiData.newClients.reduce((sum: number, r: any) => sum + r.count, 0);
    row++;

    // Completion Rate
    worksheet.getCell(`A${row}`).value = 'Touchpoints';
    worksheet.getCell(`B${row}`).value = 'Completion Rate';
    worksheet.getCell(`C${row}`).value = kpiData.completion.completion_rate;
    row++;

    // Loans Released
    worksheet.getCell(`A${row}`).value = 'Clients';
    worksheet.getCell(`B${row}`).value = 'Release Rate';
    worksheet.getCell(`C${row}`).value = kpiData.loans.release_rate;
    row++;

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 20;
    });
  }

  /**
   * Create Charts sheet
   */
  private async createChartsSheet(workbook: ExcelJS.Workbook, kpiData: any) {
    const worksheet = workbook.addWorksheet('Charts');

    // Note: ExcelJS has limited charting capabilities
    // For advanced charts, consider using a server-side charting library
    // or embedding chart images

    worksheet.addRow(['Charts']);
    worksheet.addRow(['Note: Chart visualization requires manual generation or external tools']);
    worksheet.addRow(['Charts Sheet - Data Overview']);

    worksheet.addRow([]);
    worksheet.addRow(['KPI', 'Value', 'Target', 'Status']);

    // New Clients
    const newClientsTotal = kpiData.newClients.reduce((sum: number, r: any) => sum + r.count, 0);
    worksheet.addRow(['New Clients', newClientsTotal, '50+', newClientsTotal >= 50 ? '✓' : '⚠']);

    // Completion Rate
    worksheet.addRow(['Completion Rate', `${kpiData.completion.completion_rate}%`, '80%', kpiData.completion.completion_rate >= 80 ? '✓' : '⚠']);

    // Loans Released
    worksheet.addRow(['Release Rate', `${kpiData.loans.release_rate}%`, '70%', kpiData.loans.release_rate >= 70 ? '✓' : '⚠']);

    worksheet.columns.forEach(column => {
      column.width = 15;
    });
  }

  /**
   * Create Methodology sheet
   */
  private async createMethodologySheet(workbook: ExcelJS.Workbook) {
    const worksheet = workbook.addWorksheet('Methodology');

    worksheet.addRow(['Methodology']);
    worksheet.addRow(['']);

    worksheet.addRow(['Report Information']);
    worksheet.addRow(['Generated:', new Date().toLocaleString()]);
    worksheet.addRow(['System:', 'IMU (Itinerary Manager - Uniformed)']);
    worksheet.addRow(['']);

    worksheet.addRow(['KPI Definitions']);
    worksheet.addRow(['']);
    worksheet.addRow(['1. New Clients Acquired', 'Count of new clients added weekly']);
    worksheet.addRow(['2. Visits Completion Rate', 'Percentage of completed touchpoints']);
    worksheet.addRow(['3. Loans Released (Monthly)', 'Percentage of clients with loan released']);
    worksheet.addRow(['4. Underserved Municipalities', 'Count of municipalities without assigned agents']);
    worksheet.addRow(['5. Top/Bottom Performing Agents', 'Agents ranked by completed touchpoints']);

    worksheet.addRow(['']);
    worksheet.addRow(['Data Sources']);
    worksheet.addRow(['- clients table']);
    worksheet.addRow(['- touchpoints table']);
    worksheet.addRow(['- users table']);
    worksheet.addRow(['- user_locations table']);

    worksheet.columns.forEach(column => {
      column.width = 50;
    });
  }

  /**
   * Fetch quick report data
   */
  private async fetchQuickReportData(reportType: string, startDate?: string, endDate?: string) {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`DATE(created_at) >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`DATE(created_at) <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let query = '';
    switch (reportType) {
      case 'performance':
        query = `
          SELECT u.first_name, u.last_name, u.role,
                 COUNT(t.id) as total_touchpoints,
                 COUNT(t.id) FILTER (WHERE t.status = 'Completed') as completed
          FROM users u
          LEFT JOIN touchpoints t ON u.id = t.user_id
          ${whereClause}
          GROUP BY u.id, u.first_name, u.last_name, u.role
        `;
        break;
      case 'clients':
        query = `
          SELECT c.first_name, c.last_name, c.client_type, c.municipality, c.province
          FROM clients c
          ${whereClause}
        `;
        break;
      default:
        throw new Error(`Unknown quick report type: ${reportType}`);
    }

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Fetch custom report data
   */
  private async fetchCustomReportData(sheets: any[], columns: any, filters: any, startDate?: string, endDate?: string) {
    const data: Record<string, any[]> = {};

    for (const sheet of sheets) {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (startDate) {
        conditions.push(`DATE(created_at) >= $${paramIndex}`);
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        conditions.push(`DATE(created_at) <= $${paramIndex}`);
        params.push(endDate);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Simple query for custom reports (can be enhanced)
      const query = `
        SELECT *
        FROM ${sheet.table || 'clients'}
        ${whereClause}
        LIMIT 1000
      `;

      const result = await pool.query(query, params);
      data[sheet.name] = result.rows;
    }

    return data;
  }

  /**
   * Upload file to S3
   */
  private async uploadToS3(fileName: string, buffer: Buffer): Promise<string> {
    const key = `reports/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: key,
      Body: Uint8Array.from(buffer),
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await this.s3Client.send(command);

    // Generate presigned URL (valid for 1 hour)
    const signedUrl = await getSignedUrl(
      this.s3Client,
      new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: key,
      }),
      { expiresIn: 3600 }
    );

    return signedUrl.split('?')[0]; // Return URL without query params
  }

  /**
   * Update report job record in database
   */
  private async updateReportJobRecord(userId: string, reportType: string, fileUrl: string, fileSize: number) {
    await pool.query(
      `
      UPDATE report_jobs
      SET status = 'completed',
          file_url = $1,
          file_size = $2,
          completed_at = NOW()
      WHERE created_by = $3
        AND report_type = $4
        AND status = 'processing'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [fileUrl, fileSize, userId, reportType]
    );
  }

  /**
   * Send report email notification
   */
  private async sendReportEmail(recipients: string[], fileUrl: string, reportName: string) {
    // Email sending implementation
    // This is a stub - actual implementation would use nodemailer
    logger.info('ExcelReportsProcessor', `Sending report email to ${recipients.join(', ')}`, {
      reportName,
      fileUrl,
    });
  }

  /**
   * Override concurrency for Excel reports (heavy operations)
   */
  protected getConcurrency(): number {
    return parseInt(process.env.QUEUE_CONCURRENCY_EXCEL || '1');
  }
}

/**
 * Export singleton instance getter
 */
export const excelReportsProcessor = new ExcelReportsProcessor();
