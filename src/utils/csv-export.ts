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
