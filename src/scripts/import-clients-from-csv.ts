/**
 * Import Clients from CSV Script
 *
 * This script imports client data from "LATEST 5000 CLIENTS.csv"
 * into the QA database clients table.
 *
 * Usage:
 *   npx tsx src/scripts/import-clients-from-csv.ts
 *
 * Environment:
 *   - DATABASE_URL must be set in .env file
 *   - CSV file must be in IMU root folder: "LATEST 5000 CLIENTS.csv"
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/index.js';

// Get current directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CSV file path (in IMU root folder)
// When running from backend/src/scripts directory, go up to IMU root
const CSV_FILE_PATH = path.resolve(__dirname, '../../../LATEST 5000 CLIENTS.csv');

// Batch size for database inserts
const BATCH_SIZE = 100;

/**
 * Parse CSV line into array of values
 * Handles quoted fields with commas inside
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Comma separator outside quotes
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last value
  values.push(current.trim());

  return values;
}

/**
 * Clean string value (remove extra quotes, trim whitespace)
 */
function cleanValue(value: string): string | null {
  if (!value || value === 'NULL' || value === 'null') {
    return null;
  }

  // Remove surrounding quotes if present
  let cleaned = value.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  // Return null if empty after cleaning
  return cleaned || null;
}

/**
 * Parse date from CSV (ISO format with 'T' or ' ')
 */
function parseDate(value: string): Date | null {
  if (!value || value === 'NULL' || value === 'null') {
    return null;
  }

  try {
    // Handle ISO format: 1969-09-11T16:00:00.000Z
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch {
    // Invalid date
  }

  return null;
}

/**
 * Import clients from CSV to database
 */
async function importClients() {
  console.log('🚀 Starting client import from CSV...');
  console.log(`📁 CSV file: ${CSV_FILE_PATH}`);

  // Check if CSV file exists
  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`❌ CSV file not found: ${CSV_FILE_PATH}`);
    process.exit(1);
  }

  // Read CSV file
  const csvContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    console.error('❌ CSV file is empty');
    process.exit(1);
  }

  // Parse header
  const header = parseCSVLine(lines[0]);
  console.log(`📋 CSV columns: ${header.length}`);

  // Column indices (based on CSV structure)
  const COL = {
    ID: 0,
    FIRST_NAME: 1,
    LAST_NAME: 2,
    MIDDLE_NAME: 3,
    EXT_NAME: 4,
    FULLNAME: 5,
    BARANGAY: 6,
    CLIENT_TYPE: 7,
    MUNICIPAL_CITY: 8,
    PROVINCE: 9,
    REGION: 10,
    FULL_ADDRESS: 11,
    ACCOUNT_CODE: 12,
    CONTACT_NUMBER: 13,
    ACCOUNT_NUMBER: 14,
    RANK: 15,
    MONTHLY_PENSION_AMOUNT: 16,
    MONTHLY_PENSION_GROSS: 17,
    ATM_NUMBER: 18,
    APPLICABLE_REPUBLIC_ACT: 19,
    UNIT_CODE: 20,
    PENSION_TYPE: 21,
    PCNI_ACCT_CODE: 22,
    DOB: 23,
    G3_COMPANY: 24,
    G3_STATUS: 25,
    MARKET_TYPE: 26,
    PRODUCT_TYPE: 27,
    DMVAL_CODE: 28,
    DMVAL_NAME: 29,
    DMVAL_AMOUNT: 30,
    NEXT_VISIT: 31,
    LAST_VISIT: 32,
    CLIENT_STATUS: 33,
    CREATED_AT: 34,
    CREATED_BY: 35,
    SECONDARY_MUNICIPAL_CITY: 36,
    SECONDARY_PROVINCE: 37,
    SECONDARY_FULL_ADDRESS: 38,
    PAN: 39,
  };

  // Parse data rows
  const dataRows = lines.slice(1);
  const totalClients = dataRows.length;
  console.log(`📊 Total clients to import: ${totalClients}`);

  // Statistics
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches
  for (let batchStart = 0; batchStart < totalClients; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalClients);
    const batchRows = dataRows.slice(batchStart, batchEnd);

    console.log(`\n📦 Processing batch ${batchStart + 1}-${batchEnd} of ${totalClients}...`);

    const clientValues: string[] = [];
    const clientParams: any[] = [];

    try {
      // Start transaction
      const client = await pool.connect();
      await client.query('BEGIN');

      for (let i = 0; i < batchRows.length; i++) {
        const rowIndex = batchStart + i + 1; // +1 for header
        const values = parseCSVLine(batchRows[i]);

        if (values.length < 40) {
          console.warn(`⚠️  Row ${rowIndex}: Skipping - insufficient columns (${values.length})`);
          skipped++;
          continue;
        }

        // Extract and clean values
        const firstName = cleanValue(values[COL.FIRST_NAME]);
        const lastName = cleanValue(values[COL.LAST_NAME]);
        const middleName = cleanValue(values[COL.MIDDLE_NAME]);
        const barangay = cleanValue(values[COL.BARANGAY]);
        const clientType = cleanValue(values[COL.CLIENT_TYPE]) || 'POTENTIAL';
        const municipality = cleanValue(values[COL.MUNICIPAL_CITY]);
        const province = cleanValue(values[COL.PROVINCE]);
        const region = cleanValue(values[COL.REGION]);
        const contactNumber = cleanValue(values[COL.CONTACT_NUMBER]);
        const rank = cleanValue(values[COL.RANK]);
        const pensionType = cleanValue(values[COL.PENSION_TYPE]);
        const dob = parseDate(values[COL.DOB]);
        const marketType = cleanValue(values[COL.MARKET_TYPE]);
        const productType = cleanValue(values[COL.PRODUCT_TYPE]);
        const createdAt = parseDate(values[COL.CREATED_AT]);
        const createdBy = cleanValue(values[COL.CREATED_BY]);
        const pan = cleanValue(values[COL.PAN]);

        // Validate required fields
        if (!firstName || !lastName) {
          console.warn(`⚠️  Row ${rowIndex}: Skipping - missing name (${firstName}, ${lastName})`);
          skipped++;
          continue;
        }

        // Build individual INSERT statement for this row
        const paramOffset = clientParams.length + 1;
        clientParams.push(
          firstName,        // 1
          lastName,         // 2
          middleName,       // 3
          dob,              // 4
          null,             // 5: email (not in CSV)
          contactNumber,    // 6
          null,             // 7: agency_name (not in CSV)
          null,             // 8: department (not in CSV)
          rank,             // 9: position
          null,             // 10: employment_status (not in CSV)
          null,             // 11: payroll_date (not in CSV)
          null,             // 12: tenure (not in CSV)
          clientType,       // 13
          productType,      // 14
          marketType,       // 15
          pensionType,      // 16
          pan,              // 17
          null,             // 18: facebook_link (not in CSV)
          null,             // 19: remarks (not in CSV)
          null,             // 20: agency_id (not in CSV)
          null,             // 21: user_id (created_by might not be valid UUID)
          false,            // 22: is_starred
          null,             // 23: psgc_id (not in CSV)
          region,           // 24
          province,         // 25
          municipality,     // 26
          barangay,         // 27
          null,             // 28: udi (not in CSV)
          false,            // 29: loan_released
          null,             // 30: loan_released_at
          createdAt || new Date() // 31
        );

        // Build value placeholders with correct parameter indices
        const valuePlaceholders = `($${paramOffset},$${paramOffset+1},$${paramOffset+2},$${paramOffset+3},$${paramOffset+4},$${paramOffset+5},$${paramOffset+6},$${paramOffset+7},$${paramOffset+8},$${paramOffset+9},$${paramOffset+10},$${paramOffset+11},$${paramOffset+12},$${paramOffset+13},$${paramOffset+14},$${paramOffset+15},$${paramOffset+16},$${paramOffset+17},$${paramOffset+18},$${paramOffset+19},$${paramOffset+20},$${paramOffset+21},$${paramOffset+22},$${paramOffset+23},$${paramOffset+24},$${paramOffset+25},$${paramOffset+26},$${paramOffset+27},$${paramOffset+28},$${paramOffset+29},$${paramOffset+30})`;
        clientValues.push(valuePlaceholders);

        imported++;
      }

      // Execute batch insert
      if (clientValues.length > 0) {
        const query = `
          INSERT INTO clients (
            first_name, last_name, middle_name, birth_date, email, phone,
            agency_name, department, position, employment_status, payroll_date,
            tenure, client_type, product_type, market_type, pension_type,
            pan, facebook_link, remarks, agency_id, user_id, is_starred,
            psgc_id, region, province, municipality, barangay, udi,
            loan_released, loan_released_at, created_at
          ) VALUES ${clientValues.join(', ')}
          ON CONFLICT DO NOTHING
        `;

        await client.query(query, clientParams);
        await client.query('COMMIT');
        console.log(`✅ Batch ${batchStart + 1}-${batchEnd}: ${clientValues.length} clients imported`);
      } else {
        await client.query('ROLLBACK');
      }

      client.release();
    } catch (err) {
      console.error(`❌ Error in batch ${batchStart + 1}-${batchEnd}:`, err);
      errors++;
      await pool.query('ROLLBACK').catch(() => {});
    }
  }

  // Verify import
  console.log('\n🔍 Verifying import...');
  const result = await pool.query('SELECT COUNT(*) as count FROM clients');
  const totalCount = parseInt(result.rows[0].count);

  console.log('\n📊 Import Summary:');
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   ⚠️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📋 Total clients in database: ${totalCount}`);

  await pool.end();

  if (errors > 0) {
    console.log('\n⚠️  Import completed with errors');
    process.exit(1);
  } else {
    console.log('\n✅ Import completed successfully!');
    process.exit(0);
  }
}

// Run import
importClients().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
