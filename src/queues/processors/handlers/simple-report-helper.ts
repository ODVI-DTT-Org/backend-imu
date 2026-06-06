/**
 * Simple XLSX report helper
 *
 * Builds a multi-sheet ExcelJS workbook, uploads to S3, and returns a
 * 1-hour signed download URL.  All 6 queued report handlers use this.
 */

import ExcelJS from 'exceljs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ReportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ReportSheet {
  name: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
}

export interface SimpleReportOptions {
  s3Client: S3Client;
  s3Bucket: string;
  fileNamePrefix: string;
  sheets: ReportSheet[];
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E40AF' },
};

function applySheet(ws: ExcelJS.Worksheet, sheet: ReportSheet): void {
  ws.columns = sheet.columns.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 18,
  }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  headerRow.height = 30;
  headerRow.commit();

  // Freeze top row
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  // Add data rows
  for (const row of sheet.rows) {
    ws.addRow(row).commit();
  }
}

export async function generateSimpleXlsxReport(opts: SimpleReportOptions): Promise<{
  buffer: Buffer;
  fileName: string;
  downloadUrl: string;
}> {
  const { s3Client, s3Bucket, fileNamePrefix, sheets } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'IMU System';
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.substring(0, 31));
    applySheet(ws, sheet);
  }

  const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  const fileName = `${fileNamePrefix}-${Date.now()}.xlsx`;
  const key = `reports/${fileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: Uint8Array.from(buffer),
      ContentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );

  const downloadUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: s3Bucket, Key: key }),
    { expiresIn: 3600 }
  );

  return { buffer, fileName, downloadUrl };
}
