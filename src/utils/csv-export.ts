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
