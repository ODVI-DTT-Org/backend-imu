import ExcelJS from 'exceljs';
import type { Pool } from 'pg';

interface ExcelExportOptions {
  workbookName: string;
  worksheetName: string;
  headers: string[];
  data: any[][];
  styles?: {
    headerFont?: { bold: boolean; color: { argb: string } };
    headerFill?: { argb: string };
    headerFontSize?: number;
  };
}

/**
 * Generate Excel buffer from data using ExcelJS
 * Provides basic styling and auto-fit columns
 */
export async function generateExcelBuffer(options: ExcelExportOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(options.worksheetName);

  // Add headers
  worksheet.addRow(options.headers);

  // Style headers
  const headerRow = worksheet.getRow(1);
  headerRow.font = options.styles?.headerFont || { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: options.styles?.headerFill || { argb: 'FF0F172A' },
  };
  headerRow.font = { ...headerRow.font, size: options.styles?.headerFontSize || 12 };

  // Add data rows
  options.data.forEach(row => {
    worksheet.addRow(row);
  });

  // Auto-fit columns to content
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    if (column.eachCell) {
      column.eachCell({ includeEmpty: false }, (cell) => {
        const length = cell.value ? cell.value.toString().length : 10;
        if (length > maxLength) {
          maxLength = length;
        }
      });
    }
    // Set column width with minimum of 10 and maximum of 50
    const width = maxLength < 10 ? 10 : maxLength > 50 ? 50 : maxLength + 2;
    column.width = width;
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Export touchpoints data to Excel format
 */
export async function exportTouchpointsToExcel(
  pool: Pool,
  startDate: string,
  endDate: string
): Promise<Buffer> {
  const result = await pool.query(
    `SELECT t.id, t.date, t.type, t.reason, t.status, t.notes,
            c.first_name as client_first_name, c.last_name as client_last_name,
            u.first_name as agent_first_name, u.last_name as agent_last_name
     FROM touchpoints t
     JOIN clients c ON c.id = t.client_id AND c.deleted_at IS NULL
     JOIN users u ON u.id = t.user_id
     WHERE t.date >= $1 AND t.date <= $2
     ORDER BY t.date DESC`,
    [startDate, endDate]
  );

  const headers = ['ID', 'Date', 'Type', 'Reason', 'Status', 'Client', 'Agent', 'Notes'];
  const data = result.rows.map(row => [
    row.id,
    row.date,
    row.type,
    row.reason,
    row.status,
    `${row.client_first_name} ${row.client_last_name}`,
    `${row.agent_first_name} ${row.agent_last_name}`,
    row.notes || '',
  ]);

  return generateExcelBuffer({
    workbookName: 'Touchpoints Report',
    worksheetName: 'Touchpoints',
    headers,
    data,
  });
}

/**
 * Export clients data to Excel format
 */
export async function exportClientsToExcel(
  pool: Pool,
  startDate: string,
  endDate: string
): Promise<Buffer> {
  const result = await pool.query(
    `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.client_type,
            c.product_type, c.market_type, c.created_at,
            u.first_name as agent_first_name, u.last_name as agent_last_name
     FROM clients c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.created_at >= $1 AND c.created_at <= $2
     ORDER BY c.created_at DESC`,
    [startDate, endDate]
  );

  const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Type', 'Product Type', 'Market Type', 'Agent', 'Created'];
  const data = result.rows.map(row => [
    row.id,
    row.first_name,
    row.last_name,
    row.email || '',
    row.phone || '',
    row.client_type,
    row.product_type || '',
    row.market_type || '',
    `${row.agent_first_name || ''} ${row.agent_last_name || ''}`.trim() || '',
    row.created_at,
  ]);

  return generateExcelBuffer({
    workbookName: 'Clients Report',
    worksheetName: 'Clients',
    headers,
    data,
  });
}

/**
 * Export attendance data to Excel format
 */
export async function exportAttendanceToExcel(
  pool: Pool,
  startDate: string,
  endDate: string
): Promise<Buffer> {
  const result = await pool.query(
    `SELECT a.id, a.date, a.check_in, a.check_out, a.status,
            u.first_name, u.last_name
     FROM attendance a
     JOIN users u ON u.id = a.user_id
     WHERE a.date >= $1 AND a.date <= $2
     ORDER BY a.date DESC`,
    [startDate, endDate]
  );

  const headers = ['ID', 'Date', 'Agent', 'Check In', 'Check Out', 'Status'];
  const data = result.rows.map(row => [
    row.id,
    row.date,
    `${row.first_name} ${row.last_name}`,
    row.check_in || '',
    row.check_out || '',
    row.status,
  ]);

  return generateExcelBuffer({
    workbookName: 'Attendance Report',
    worksheetName: 'Attendance',
    headers,
    data,
  });
}
