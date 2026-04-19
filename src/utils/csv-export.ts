// src/utils/csv-export.ts

/**
 * CSV Export Utility
 *
 * Provides functions to convert data to CSV format and download it
 *
 * @file csv-export.ts
 */

import { pool } from '../db/index.js';

export interface CsvExportOptions {
  filename: string;
  headers: string[];
  rowMapper: (row: any) => string[];
}

/**
 * Convert array of objects to CSV format
 */
export function arrayToCsv<T>(data: T[], options: CsvExportOptions): string {
  const { filename, headers, rowMapper } = options;

  // Create header row
  const headerRow = headers.join(',');

  // Create data rows
  const dataRows = data.map(row => {
    const values = rowMapper(row);
    // Escape values that contain commas, quotes, or newlines
    const escapedValues = values.map(value => {
      const stringValue = String(value ?? '');
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    return escapedValues.join(',');
  });

  // Combine header and data rows
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Fetch data and export as CSV
 */
export async function exportToCsv<T>(
  query: string,
  params: any[],
  options: CsvExportOptions
): Promise<{ filename: string; content: string; mime_type: string }> {
  const result = await pool.query(query, params);
  const content = arrayToCsv(result.rows, options);

  return {
    filename: `${options.filename}.csv`,
    content,
    mime_type: 'text/csv',
  };
}

/**
 * Generate date range condition for SQL queries
 */
export function getDateRangeCondition(
  startDate?: string,
  endDate?: string,
  columnName: string = 'created_at'
): { condition: string; params: any[] } {
  if (startDate && endDate) {
    return {
      condition: `${columnName} >= $1 AND ${columnName} <= $2`,
      params: [startDate, endDate],
    };
  } else if (startDate) {
    return {
      condition: `${columnName} >= $1`,
      params: [startDate],
    };
  } else if (endDate) {
    return {
      condition: `${columnName} <= $1`,
      params: [endDate],
    };
  }
  return {
    condition: '',
    params: [],
  };
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0]; // YYYY-MM-DD format
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format datetime for display
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace('T', ' ').substring(0, 19); // YYYY-MM-DD HH:MM:SS
}

/**
 * Validate date range
 * @throws Error if end_date is before start_date
 */
export function validateDateRange(startDate?: string, endDate?: string): void {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      throw new Error('End date must be on or after start date');
    }
  }
}

/**
 * Sanitize sensitive data from export
 * Removes or masks sensitive fields like passwords, tokens, SSN, etc.
 *
 * NOTE: Currently exported but not actively used in reports endpoints.
 * Available for future use when exporting sensitive user data.
 * To use: Wrap result.rows before passing to arrayToCsv().
 *
 * Example:
 *   const sanitizedData = sanitizeSensitiveData(result.rows);
 *   const content = arrayToCsv(sanitizedData, options);
 */
export function sanitizeSensitiveData(data: any[], sensitiveFields: string[] = []): any[] {
  const defaultSensitiveFields = [
    'password',
    'token',
    'secret',
    'api_key',
    'apikey',
    'access_token',
    'refresh_token',
    'ssn',
    'social_security',
    'credit_card',
    'pin',
    'otp',
  ];

  const fieldsToSanitize = [...defaultSensitiveFields, ...sensitiveFields];

  return data.map(row => {
    const sanitized = { ...row };

    fieldsToSanitize.forEach(field => {
      const keys = Object.keys(sanitized);
      keys.forEach(key => {
        if (key.toLowerCase().includes(field.toLowerCase())) {
          // Mask sensitive data: show only last 4 characters
          const value = sanitized[key];
          if (value && typeof value === 'string' && value.length > 4) {
            sanitized[key] = '***' + value.slice(-4);
          } else if (value) {
            sanitized[key] = '***';
          }
        }
      });
    });

    return sanitized;
  });
}

/**
 * Get record count for preview
 */
export async function getRecordCount(
  query: string,
  params: any[]
): Promise<number> {
  // Extract the base query for counting
  const countQuery = `SELECT COUNT(*) as count FROM (${query}) as subquery`;
  const result = await pool.query(countQuery, params);
  return parseInt(result.rows[0].count);
}

/**
 * Report export configuration
 */
export interface ReportExportConfig {
  filename: string;
  headers: string[];
  rowMapper: (row: any) => string[];
}

/**
 * Get report export configuration by type
 */
export function getReportExportConfig(
  reportType: 'releases' | 'visits',
  startDate?: string,
  endDate?: string
): ReportExportConfig {
  const dateSuffix = `${startDate || 'all'}_${endDate || 'all'}`;

  switch (reportType) {
    case 'releases':
      return {
        filename: `releases_${dateSuffix}`,
        headers: [
          'ID',
          'Client First Name',
          'Client Middle Name',
          'Client Last Name',
          'Agent First Name',
          'Agent Last Name',
          'Product Type',
          'Loan Type',
          'Amount',
          'Status',
          'Approval Notes',
          'Approved By',
          'Approved At',
          'Created At',
        ],
        rowMapper: (row) => [
          row.id,
          row.first_name,
          row.middle_name,
          row.last_name,
          row.agent_first_name,
          row.agent_last_name,
          row.product_type,
          row.loan_type,
          row.udi_number,
          row.status,
          row.approval_notes,
          row.approved_by,
          row.approved_at,
          row.created_at,
        ],
      };

    case 'visits':
      return {
        filename: `visits_${dateSuffix}`,
        headers: [
          'ID',
          'Client First Name',
          'Client Middle Name',
          'Client Last Name',
          'Agent First Name',
          'Agent Last Name',
          'Type',
          'Time In',
          'Time Out',
          'Odometer Arrival',
          'Odometer Departure',
          'Photo URL',
          'Notes',
          'Reason',
          'Status',
          'Address',
          'Latitude',
          'Longitude',
          'Created At',
        ],
        rowMapper: (row) => [
          row.id,
          row.first_name,
          row.middle_name,
          row.last_name,
          row.agent_first_name,
          row.agent_last_name,
          row.type,
          row.time_in,
          row.time_out,
          row.odometer_arrival,
          row.odometer_departure,
          row.photo_url,
          row.notes,
          row.reason,
          row.status,
          row.address,
          row.latitude,
          row.longitude,
          row.created_at,
        ],
      };

    default:
      throw new Error('Invalid report type');
  }
}

/**
 * Get report query by type
 */
export function getReportQuery(
  reportType: 'releases' | 'visits',
  startDate?: string,
  endDate?: string
): { query: string; params: any[] } {
  switch (reportType) {
    case 'releases': {
      const dateCondition = getDateRangeCondition(startDate, endDate, 'r.created_at::date');
      return {
        query: `
          SELECT
            r.id,
            c.first_name,
            c.middle_name,
            c.last_name,
            u.first_name as agent_first_name,
            u.last_name as agent_last_name,
            r.product_type,
            r.loan_type,
            r.udi_number,
            r.status,
            r.approval_notes,
            r.approved_by,
            r.approved_at,
            r.created_at
          FROM releases r
          JOIN clients c ON c.id = r.client_id
          JOIN users u ON u.id = r.user_id
          ${dateCondition.condition ? `WHERE ${dateCondition.condition}` : 'WHERE 1=1'}
          ORDER BY r.created_at DESC
          LIMIT 10000
        `,
        params: dateCondition.params,
      };
    }

    case 'visits': {
      const dateCondition = getDateRangeCondition(startDate, endDate, 'v.created_at::date');
      return {
        query: `
          SELECT
            v.id,
            c.first_name,
            c.middle_name,
            c.last_name,
            u.first_name as agent_first_name,
            u.last_name as agent_last_name,
            v.type,
            v.time_in,
            v.time_out,
            v.odometer_arrival,
            v.odometer_departure,
            v.photo_url,
            v.notes,
            v.reason,
            v.status,
            v.address,
            v.latitude,
            v.longitude,
            v.created_at
          FROM visits v
          JOIN clients c ON c.id = v.client_id
          JOIN users u ON u.id = v.user_id
          ${dateCondition.condition ? `WHERE ${dateCondition.condition}` : 'WHERE 1=1'}
          ORDER BY v.created_at DESC
          LIMIT 10000
        `,
        params: dateCondition.params,
      };
    }

    default:
      throw new Error('Invalid report type');
  }
}
