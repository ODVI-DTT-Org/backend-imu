/**
 * Import 5000 Clients from CSV (Memory-efficient batch processing)
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

// Parse connection string and handle SSL properly for DigitalOcean
const rawConnectionString = process.env.DATABASE_URL;
let connectionString = rawConnectionString;

// Remove sslmode from URL to handle in ssl config
try {
  const url = new URL(connectionString || '');
  url.searchParams.delete('sslmode');
  connectionString = url.toString();
} catch {
  // Keep original if parsing fails
}

const pool = new Pool({
  connectionString,
  ssl: rawConnectionString?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : undefined,
  max: 5, // Limit pool size
});

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
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Process CSV file in batches
 */
async function processCSVInBatches(csvPath: string, batchSize = 50) {
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split('\n');

  // Get header
  const headerLine = lines[0];
  const headers = parse(headerLine, {
    columns: false,
    relax_quotes: true,
    trim: true,
  })[0];

  const totalRecords = lines.length - 1; // Exclude header
  let processedRecords = 0;
  let successCount = 0;
  let errorCount = 0;

  console.log(`=== 5000 Clients Import (Batch Mode) ===`);
  console.log(`Total records: ${totalRecords}`);
  console.log(`Batch size: ${batchSize}\n`);

  // Process in batches
  for (let startIdx = 1; startIdx < lines.length; startIdx += batchSize) {
    const endIdx = Math.min(startIdx + batchSize - 1, lines.length - 1);
    const batchLines = lines.slice(startIdx, endIdx + 1);

    // Parse this batch
    const batchRecords: any[] = [];
    for (const line of batchLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const row = parse(trimmed, {
          columns: false,
          relax_quotes: true,
          trim: true,
          relax_column_count: true,
        });

        if (row.length > 0) {
          const record: any = {};
          for (let j = 0; j < headers.length && j < row[0].length; j++) {
            record[headers[j]] = row[0][j];
          }
          batchRecords.push(record);
        }
      } catch (e) {
        // Skip malformed lines
      }
    }

    // Process this batch
    for (const record of batchRecords) {
      const mappedData = {
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

      try {
        const query = `
          INSERT INTO clients (
            first_name, last_name, middle_name, ext_name, fullname,
            barangay, municipality, province, region, full_address,
            account_code, phone, account_number, rank,
            monthly_pension_amount, monthly_pension_gross, atm_number,
            applicable_republic_act, unit_code, pension_type, pcni_acct_code,
            birth_date, "3g_company", "3g_status", client_type,
            market_type, product_type, "DMVAL_code", "DMVAL_name", "DMVAL_amount",
            next_visit, last_visit, client_status, created_at, legacy_created_by,
            secondary_municipality, secondary_province, secondary_full_address, pan
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, $37, $38, $39
          )
        `;

        const values = [
          mappedData.first_name, mappedData.last_name, mappedData.middle_name,
          mappedData.ext_name, mappedData.fullname, mappedData.barangay,
          mappedData.municipality, mappedData.province, mappedData.region,
          mappedData.full_address, mappedData.account_code, mappedData.phone,
          mappedData.account_number, mappedData.rank, mappedData.monthly_pension_amount,
          mappedData.monthly_pension_gross, mappedData.atm_number,
          mappedData.applicable_republic_act, mappedData.unit_code,
          mappedData.pension_type, mappedData.pcni_acct_code, mappedData.birth_date,
          mappedData['3g_company'], mappedData['3g_status'], mappedData.client_type,
          mappedData.market_type, mappedData.product_type, mappedData['DMVAL_code'],
          mappedData['DMVAL_name'], mappedData['DMVAL_amount'], mappedData.next_visit,
          mappedData.last_visit, mappedData.client_status, mappedData.created_at,
          mappedData.legacy_created_by, mappedData.secondary_municipality,
          mappedData.secondary_province, mappedData.secondary_full_address, mappedData.pan,
        ];

        await pool.query(query, values);
        successCount++;
        processedRecords++;

      } catch (error: any) {
        errorCount++;
        console.error(`❌ Error (${processedRecords}): ${record.first_name} ${record.last_name} - ${error.message}`);
      }
    }

    // Progress update
    console.log(`Progress: ${processedRecords}/${totalRecords} records processed (${successCount} success, ${errorCount} errors)`);

    // Force garbage collection hint
    if (global.gc) {
      global.gc();
    }
  }

  return { totalRecords, successCount, errorCount, processedRecords };
}

/**
 * Main import function
 */
async function importClients(csvPath: string) {
  const startTime = Date.now();

  try {
    const result = await processCSVInBatches(csvPath, 50); // Process 50 records at a time

    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log('\n=== Import Summary ===');
    console.log(`Total records processed: ${result.processedRecords}`);
    console.log(`✅ Successfully imported: ${result.successCount}`);
    console.log(`❌ Failed: ${result.errorCount}`);
    console.log(`Time elapsed: ${elapsed} seconds`);

    // Verify database count
    const dbResult = await pool.query('SELECT COUNT(*) as count FROM clients');
    console.log(`\nTotal clients in database: ${dbResult.rows[0].count}`);

  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Main execution
const csvPath = resolve(__dirname, '../../docs/5000 mock data/LATEST 5000 CLIENTS.csv');

importClients(csvPath).catch(console.error);
