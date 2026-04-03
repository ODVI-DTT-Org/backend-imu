/**
 * CSV Exports Processor
 *
 * Handles CSV export jobs including:
 * - Touchpoints CSV export
 * - Clients CSV export
 * - Attendance CSV export
 */

import { Job } from 'bullmq';
import { pool } from '../../db/index.js';
import { BaseProcessor } from '../base-processor.js';
import type { ReportJobData, JobResult } from '../jobs/job-types.js';
import { logger } from '../../utils/logger.js';
import { writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * CSV Exports Processor
 */
export class CsvExportsProcessor extends BaseProcessor<ReportJobData, JobResult> {
  constructor() {
    super('reports'); // Use same queue as reports
  }

  /**
   * Process CSV export job
   */
  async process(job: Job<ReportJobData>): Promise<JobResult> {
    const { type, userId, params } = job.data;
    const startedAt = new Date();

    // Update progress
    await this.updateProgress(job, {
      progress: 10,
      total: 100,
      current: 0,
      message: 'Initializing CSV export...',
    });

    try {
      let csvData: string;
      let filename: string;

      switch (type) {
        case 'export_touchpoints_csv':
          ({ csvData, filename } = await this.exportTouchpointsCsv(params));
          break;
        case 'export_clients_csv':
          ({ csvData, filename } = await this.exportClientsCsv(params));
          break;
        case 'export_attendance_csv':
          ({ csvData, filename } = await this.exportAttendanceCsv(params));
          break;
        default:
          throw new Error(`Unknown CSV export type: ${type}`);
      }

      // Save CSV file
      const exportDir = join(process.cwd(), 'exports');
      const filePath = join(exportDir, filename);

      await this.updateProgress(job, {
        progress: 80,
        total: 100,
        current: 80,
        message: 'Writing CSV file...',
      });

      await writeFile(filePath, csvData, 'utf-8');

      await this.updateProgress(job, {
        progress: 100,
        total: 100,
        current: 100,
        message: 'CSV export complete',
      });

      return {
        success: true,
        total: 1,
        succeeded: [type],
        failed: [],
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        result: {
          exportType: type,
          filename,
          filePath,
          recordCount: csvData.split('\n').length - 1, // Exclude header
        },
      };
    } catch (error: any) {
      logger.error('CsvExportsProcessor', 'CSV export failed', error);
      throw error;
    }
  }

  /**
   * Export touchpoints to CSV
   */
  private async exportTouchpointsCsv(params?: any) {
    const { startDate, endDate, userId: targetUserId } = params || {};

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
        t.id,
        t.client_id,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        t.user_id,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name,
        t.touchpoint_number,
        t.type,
        t.status,
        t.date,
        t.reason,
        t.created_at
      FROM touchpoints t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.user_id = u.id
      ${whereClause}
      ORDER BY t.date DESC, t.created_at DESC
      `,
      queryParams
    );

    // Generate CSV
    const headers = [
      'ID',
      'Client ID',
      'Client First Name',
      'Client Last Name',
      'Agent ID',
      'Agent First Name',
      'Agent Last Name',
      'Touchpoint Number',
      'Type',
      'Status',
      'Date',
      'Reason',
      'Created At'
    ];

    const rows = result.rows.map(row => [
      row.id,
      row.client_id,
      row.client_first_name,
      row.client_last_name,
      row.user_id,
      row.agent_first_name,
      row.agent_last_name,
      row.touchpoint_number,
      row.type,
      row.status,
      row.date,
      row.reason,
      row.created_at
    ]);

    const csvData = this.generateCsv(headers, rows);
    const filename = `touchpoints_export_${Date.now()}.csv`;

    return { csvData, filename };
  }

  /**
   * Export clients to CSV
   */
  private async exportClientsCsv(params?: any) {
    const { municipality, province, clientType } = params || {};

    const conditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

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

    if (clientType) {
      conditions.push(`c.client_type = $${paramIndex}`);
      queryParams.push(clientType);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.middle_name,
        c.email,
        c.phone,
        c.municipality,
        c.province,
        c.client_type,
        c.product_type,
        c.market_type,
        c.pension_type,
        c.is_starred,
        c.loan_released,
        c.created_at
      FROM clients c
      ${whereClause}
      ORDER BY c.last_name, c.first_name
      `,
      queryParams
    );

    // Generate CSV
    const headers = [
      'ID',
      'First Name',
      'Last Name',
      'Middle Name',
      'Email',
      'Phone',
      'Municipality',
      'Province',
      'Client Type',
      'Product Type',
      'Market Type',
      'Pension Type',
      'Is Starred',
      'Loan Released',
      'Created At'
    ];

    const rows = result.rows.map(row => [
      row.id,
      row.first_name,
      row.last_name,
      row.middle_name,
      row.email,
      row.phone,
      row.municipality,
      row.province,
      row.client_type,
      row.product_type,
      row.market_type,
      row.pension_type,
      row.is_starred,
      row.loan_released,
      row.created_at
    ]);

    const csvData = this.generateCsv(headers, rows);
    const filename = `clients_export_${Date.now()}.csv`;

    return { csvData, filename };
  }

  /**
   * Export attendance to CSV
   */
  private async exportAttendanceCsv(params?: any) {
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
        a.id,
        a.user_id,
        u.first_name as agent_first_name,
        u.last_name as agent_last_name,
        a.date,
        a.status,
        a.time_in,
        a.time_out,
        a.notes,
        a.created_at
      FROM attendance a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.date DESC, a.time_in DESC
      `,
      queryParams
    );

    // Generate CSV
    const headers = [
      'ID',
      'User ID',
      'Agent First Name',
      'Agent Last Name',
      'Date',
      'Status',
      'Time In',
      'Time Out',
      'Notes',
      'Created At'
    ];

    const rows = result.rows.map(row => [
      row.id,
      row.user_id,
      row.agent_first_name,
      row.agent_last_name,
      row.date,
      row.status,
      row.time_in,
      row.time_out,
      row.notes,
      row.created_at
    ]);

    const csvData = this.generateCsv(headers, rows);
    const filename = `attendance_export_${Date.now()}.csv`;

    return { csvData, filename };
  }

  /**
   * Generate CSV string from headers and rows
   */
  private generateCsv(headers: string[], rows: any[][]): string {
    // Escape CSV values
    const escapeValue = (value: any): string => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      // If value contains comma, quote, or newline, wrap in quotes and escape quotes
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    // Generate header row
    const headerRow = headers.map(escapeValue).join(',');

    // Generate data rows
    const dataRows = rows.map(row =>
      row.map(escapeValue).join(',')
    );

    // Combine header and data rows
    return [headerRow, ...dataRows].join('\n');
  }

  /**
   * Override concurrency for CSV exports
   */
  protected getConcurrency(): number {
    return parseInt(process.env.QUEUE_CONCURRENCY_CSV_EXPORTS || '2');
  }
}

/**
 * Export singleton instance getter
 */
export const csvExportsProcessor = new CsvExportsProcessor();
