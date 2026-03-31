/**
 * Check CSV for duplicate entries
 */

import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function checkCSVDuplicates() {
  const csvPath = resolve(__dirname, '../../docs/5000 mock data/LATEST 5000 CLIENTS.csv');
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split('\n');

  // Get header
  const headers = parse(lines[0], { columns: false, relax_quotes: true, trim: true })[0];
  console.log('CSV Headers:', headers.length);

  // Track all records
  const allRecords: any[] = [];
  let validRecordCount = 0;
  let invalidRecordCount = 0;

  // Process all lines
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
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

        // Check if valid (has first_name)
        if (record.first_name && record.first_name !== 'NULL' && record.first_name !== '') {
          validRecordCount++;
          allRecords.push(record);
        } else {
          invalidRecordCount++;
        }
      }
    } catch (e) {
      invalidRecordCount++;
    }
  }

  console.log('\n=== CSV Analysis ===');
  console.log('Total valid records:', validRecordCount);
  console.log('Invalid records:', invalidRecordCount);

  // Check for duplicates by first_name + last_name
  const nameMap = new Map<string, number>();
  allRecords.forEach(record => {
    const key = `${record.first_name}|${record.last_name}`;
    nameMap.set(key, (nameMap.get(key) || 0) + 1);
  });

  const duplicates = Array.from(nameMap.entries()).filter(([_, count]) => count > 1);
  console.log('\n=== Duplicate Names in CSV ===');
  console.log('Found', duplicates.length, 'duplicate name combinations');

  if (duplicates.length > 0) {
    console.log('\nTop 20 duplicates:');
    duplicates.sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([name, count]) => {
      console.log(`  ${name}: ${count} records`);
    });
  }

  // Check for duplicates by phone
  const phoneMap = new Map<string, number>();
  allRecords.forEach(record => {
    const phone = record.contact_number;
    if (phone && phone !== 'NULL' && phone !== 'N/A' && phone !== '' && phone !== 'NO CONTACT NUMBER') {
      phoneMap.set(phone, (phoneMap.get(phone) || 0) + 1);
    }
  });

  const phoneDuplicates = Array.from(phoneMap.entries()).filter(([_, count]) => count > 1);
  console.log('\n=== Duplicate Phone Numbers in CSV ===');
  console.log('Found', phoneDuplicates.length, 'duplicate phone numbers');

  if (phoneDuplicates.length > 0) {
    console.log('\nTop 10 duplicates:');
    phoneDuplicates.sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([phone, count]) => {
      console.log(`  ${phone}: ${count} records`);
    });
  }

  console.log('\n=== Expected Import Count ===');
  console.log('Valid records to import:', validRecordCount);
}

checkCSVDuplicates().catch(console.error);
