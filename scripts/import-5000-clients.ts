/**
 * Import 5000 Clients from CSV
 *
 * This script imports client data from "LATEST 5000 CLIENTS.csv"
 * into the PostgreSQL database.
 *
 * Usage:
 *   tsx scripts/import-5000-clients.ts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envFileFromArg = process.env.ENV_FILE;
const isQa = (process.env.NODE_ENV || '').toLowerCase() === 'qa';
const envCandidatePaths = [
  envFileFromArg ? resolve(__dirname, '..', envFileFromArg) : null,
  isQa ? resolve(__dirname, '../.env.qa') : null,
  resolve(__dirname, '../.env'),
].filter(Boolean) as string[];

const envPath = envCandidatePaths.find(p => fs.existsSync(p));
dotenv.config({ path: envPath });

const rawConnectionString = process.env.DATABASE_URL;
let connectionString = rawConnectionString;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Please set it in backend/.env');
}

// Ensure connectionString doesn't force strict SSL verification via query params.
// We want the Pool.ssl option below to be the source of truth for this script.
try {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('sslrootcert');
  url.searchParams.delete('sslcert');
  url.searchParams.delete('sslkey');
  url.searchParams.delete('sslpassword');
  connectionString = url.toString();
} catch {
  // If DATABASE_URL isn't a URL (unlikely), keep it as-is.
}

const pool = new Pool({
  connectionString,
  // This script is meant for one-off data loads into hosted databases.
  // Many hosted Postgres providers present cert chains which fail strict verification
  // from local environments, resulting in "self-signed certificate in certificate chain".
  // If you need strict verification, provide a CA bundle and tighten this setting.
  ssl: { rejectUnauthorized: false },
});

/**
 * Parse CSV file and return records
 */
function parseCSV(filePath: string): any[] {
  // Some source CSVs contain non-standard whitespace (e.g., NBSP) or null bytes
  // after closing quotes, which can cause csv-parse to throw. Sanitize before parse.
  const raw = fs.readFileSync(filePath, 'utf-8');
  let fileContent = raw
    .replace(/\u0000/g, '') // null bytes
    .replace(/\u00A0/g, ' ') // non‑breaking spaces
    .replace(/\u200B/g, ''); // zero‑width spaces

  // If the CSV still contains hard parse errors (invalid closing quote), we prefer to
  // skip the offending line(s) rather than fail the entire import.
  const skippedLines: number[] = [];
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true, // Handle malformed quotes
        relax_column_count: true, // Handle varying column counts
        relax_column_count_less: true, // Allow fewer columns
        relax_column_count_more: true, // Allow more columns
        bom: true, // Handle BOM if present
        cast: false, // Don't cast types
        cast_date: false,
      });

      if (skippedLines.length > 0) {
        console.warn(`⚠️  Skipped ${skippedLines.length} malformed CSV line(s): ${skippedLines.join(', ')}`);
      }
      return records;
    } catch (err: any) {
      const line = typeof err?.lines === 'number' ? err.lines : null;
      if (!line || line < 2) throw err; // line 1 is header; if unknown, rethrow

      // Remove the offending raw line and retry.
      const lines = fileContent.split(/\r?\n/);
      const idx = line - 1; // 1-indexed to 0-indexed
      if (idx < 0 || idx >= lines.length) throw err;
      lines.splice(idx, 1);
      fileContent = lines.join('\n');
      skippedLines.push(line);
    }
  }

  throw new Error('Failed to parse CSV after skipping malformed lines.');

}

/**
 * Convert value to NULL if it's a null-like string
 */
function toNull(value: any): any {
  if (value === null || value === undefined) return null;
  const strValue = String(value).trim();
  if (strValue === '' || strValue === 'NULL' || strValue === 'N/A' || strValue.toLowerCase() === 'null') {
    return null;
  }
  return strValue;
}

/**
 * Convert string to numeric, return null if invalid
 */
function toNumeric(value: any): number | null {
  const cleaned = toNull(value);
  if (cleaned === null) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Convert string to date, return null if invalid
 */
function toDate(value: any): Date | null {
  const cleaned = toNull(value);
  if (cleaned === null) return null;

  // Handle various date formats
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return null;

  return date;
}

/**
 * Map CSV record to database column values
 */
function mapCSVToDB(record: any): any {
  return {
    first_name: toNull(record.first_name),
    last_name: toNull(record.last_name),
    middle_name: toNull(record.middle_name),
    ext_name: toNull(record.ext_name),
    fullname: toNull(record.fullname),
    barangay: toNull(record.barangay),
    municipality: toNull(record.municipal_city),
    province: toNull(record.province),
    region: toNull(record.region),
    full_address: toNull(record.full_address),
    account_code: toNull(record.account_code),
    phone: toNull(record.contact_number),
    account_number: toNull(record.account_number),
    rank: toNull(record.rank),
    monthly_pension_amount: toNumeric(record.monthly_pension_amount),
    monthly_pension_gross: toNumeric(record.monthly_pension_gross),
    atm_number: toNull(record.atm_number),
    applicable_republic_act: toNull(record.applicable_republic_act),
    unit_code: toNull(record.unit_code),
    pension_type: toNull(record.pension_type),
    pcni_acct_code: toNull(record.pcni_acct_code),
    birth_date: toDate(record.dob),
    '3g_company': toNull(record['3G_company']),
    '3g_status': toNull(record['3G_status']),
    client_type: toNull(record.client_type) || 'POTENTIAL',
    market_type: toNull(record.market_type),
    product_type: toNull(record.product_type),
    'DMVAL_code': toNull(record.DMVAL_code),
    'DMVAL_name': toNull(record.DMVAL_name),
    'DMVAL_amount': toNumeric(record.DMVAL_amount),
    next_visit: toDate(record.next_visit),
    last_visit: toDate(record.last_visit),
    client_status: toNull(record.client_status) || 'active',
    created_at: toDate(record.created_at) || new Date(),
    legacy_created_by: toNull(record.created_by),
    secondary_municipality: toNull(record.secondary_municipal_city),
    secondary_province: toNull(record.secondary_province),
    secondary_full_address: toNull(record.secondary_full_address),
    pan: toNull(record.PAN),
  };
}

/**
 * Import clients to database
 */
async function importClients(csvPath: string) {
  console.log('=== 5000 Clients Import ===\n');

  // Parse CSV
  console.log(`Reading CSV file: ${csvPath}`);
  const records = parseCSV(csvPath);
  console.log(`Found ${records.length} records in CSV\n`);

  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  // Process each record
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const mappedData = mapCSVToDB(record);

    try {
      // Insert client with generated UUID
      const query = `
        INSERT INTO clients (
          id,
          first_name,
          last_name,
          middle_name,
          ext_name,
          fullname,
          barangay,
          municipality,
          province,
          region,
          full_address,
          account_code,
          phone,
          account_number,
          rank,
          monthly_pension_amount,
          monthly_pension_gross,
          atm_number,
          applicable_republic_act,
          unit_code,
          pension_type,
          pcni_acct_code,
          birth_date,
          "3g_company",
          "3g_status",
          client_type,
          market_type,
          product_type,
          "DMVAL_code",
          "DMVAL_name",
          "DMVAL_amount",
          next_visit,
          last_visit,
          client_status,
          created_at,
          legacy_created_by,
          secondary_municipality,
          secondary_province,
          secondary_full_address,
          pan
        ) VALUES (
          gen_random_uuid(),
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35, $36, $37, $38, $39
        )
      `;

      const values = [
        mappedData.first_name,
        mappedData.last_name,
        mappedData.middle_name,
        mappedData.ext_name,
        mappedData.fullname,
        mappedData.barangay,
        mappedData.municipality,
        mappedData.province,
        mappedData.region,
        mappedData.full_address,
        mappedData.account_code,
        mappedData.phone,
        mappedData.account_number,
        mappedData.rank,
        mappedData.monthly_pension_amount,
        mappedData.monthly_pension_gross,
        mappedData.atm_number,
        mappedData.applicable_republic_act,
        mappedData.unit_code,
        mappedData.pension_type,
        mappedData.pcni_acct_code,
        mappedData.birth_date,
        mappedData['3g_company'],
        mappedData['3g_status'],
        mappedData.client_type,
        mappedData.market_type,
        mappedData.product_type,
        mappedData['DMVAL_code'],
        mappedData['DMVAL_name'],
        mappedData['DMVAL_amount'],
        mappedData.next_visit,
        mappedData.last_visit,
        mappedData.client_status,
        mappedData.created_at,
        mappedData.legacy_created_by,
        mappedData.secondary_municipality,
        mappedData.secondary_province,
        mappedData.secondary_full_address,
        mappedData.pan,
      ];

      await pool.query(query, values);
      successCount++;

      // Progress indicator every 100 records
      if ((i + 1) % 100 === 0) {
        console.log(`Progress: ${i + 1}/${records.length} records processed...`);
      }
    } catch (error: any) {
      errorCount++;
      const errorMsg = `Record ${i + 1} (${record.first_name} ${record.last_name}): ${error.message}`;
      errors.push(errorMsg);
      console.error(`❌ Error: ${errorMsg}`);
    }
  }

  // Print summary
  console.log('\n=== Import Summary ===');
  console.log(`Total records: ${records.length}`);
  console.log(`✅ Successfully imported: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);

  if (errors.length > 0) {
    console.log('\n=== Errors (first 10) ===');
    errors.slice(0, 10).forEach(err => console.log(err));
    if (errors.length > 10) {
      console.log(`... and ${errors.length - 10} more errors`);
    }
  }

  // Verify database count
  const result = await pool.query('SELECT COUNT(*) as count FROM clients');
  console.log(`\nTotal clients in database: ${result.rows[0].count}`);

  await pool.end();
}

// Main execution
const csvPath = resolve(__dirname, '../../docs/5000 mock data/LATEST 5000 CLIENTS.csv');

importClients(csvPath).catch(console.error);
