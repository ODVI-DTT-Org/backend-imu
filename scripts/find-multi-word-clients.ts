/**
 * Find clients with 4+ word names for testing
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl?.includes('ondigitalocean.com') && !databaseUrl.includes('uselibpqcompat=')) {
  databaseUrl += '&uselibpqcompat=true';
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : false,
});

async function findMultiWordClients() {
  const query = `
SELECT
  first_name,
  last_name,
  middle_name,
  full_name,
  ARRAY_LENGTH(regexp_split_to_array(full_name, '\\s+'), 1) as word_count
FROM clients
WHERE ARRAY_LENGTH(regexp_split_to_array(full_name, '\\s+'), 1) >= 4
ORDER BY word_count DESC, full_name
LIMIT 10;
`;

  const result = await pool.query(query);
  console.log('Clients with 4+ word names:');
  console.log('================================');
  result.rows.forEach((row, index) => {
    console.log(`${index + 1}. ${row.word_count} words: "${row.full_name}"`);
    console.log(`   First: "${row.first_name}", Last: "${row.last_name}", Middle: "${row.middle_name}"`);
    console.log('');
  });

  await pool.end();
}

findMultiWordClients().catch(console.error);
