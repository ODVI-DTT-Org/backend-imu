/**
 * PSGC Matching Job Processor
 *
 * Processes PSGC matching in background chunks.
 */

import { pool } from '../db/index.js';
import {
  BackgroundJob,
  completeJob,
  failJob,
  updateProgress,
  JobProcessor,
} from './backgroundJob.js';
import { logger } from '../utils/logger.js';

const BATCH_SIZE = 50; // Process 50 clients per batch

interface PSGCMatchResult {
  client_id: string;
  psgc_id?: string;
  match_type?: 'exact' | 'reverse' | 'keyword' | 'advanced_keyword';
  match_reason?: string;
  status: 'matched' | 'unmatched';
}

interface PSGCMatchingResult {
  summary: {
    total_processed: number;
    matched_count: number;
    unmatched_count: number;
    success_rate: string;
  };
  matched: PSGCMatchResult[];
  unmatched: PSGCMatchResult[];
}

/**
 * Get clients without PSGC ID
 */
async function getClientsWithoutPSGC(limit: number, offset: number): Promise<any[]> {
  const result = await pool.query(
    `SELECT id, first_name, last_name, province, municipality, barangay
     FROM clients
     WHERE psgc_id IS NULL
       AND (province IS NOT NULL OR municipality IS NOT NULL)
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows;
}

/**
 * Count total clients without PSGC
 */
async function countClientsWithoutPSGC(): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM clients
     WHERE psgc_id IS NULL
       AND (province IS NOT NULL OR municipality IS NOT NULL)`
  );

  return parseInt(result.rows[0].count);
}

/**
 * Match client to PSGC record using progressive strategies
 */
async function matchClientToPSGC(client: any): Promise<PSGCMatchResult> {
  const { id: clientId, municipality, province } = client;

  // Normalize strings
  const normalize = (str: string) => str?.trim().toUpperCase().replace(/\s+/g, ' ') || '';

  const clientMunicipality = normalize(municipality || '');
  const clientProvince = normalize(province || '');

  // Strategy 1: Direct pattern match
  let result = await pool.query(
    `SELECT id, province, mun_city
     FROM psgc
     WHERE TRIM(province) || '-' || TRIM(mun_city) = $1
     LIMIT 1`,
    [`${clientProvince}-${clientMunicipality}`]
  );

  if (result.rows.length > 0) {
    await updateClientPSGC(clientId, result.rows[0].id);
    return {
      client_id: clientId,
      psgc_id: result.rows[0].id,
      match_type: 'exact',
      status: 'matched',
    };
  }

  // Strategy 2: Reverse pattern match (client municipality in PSGC municipality)
  result = await pool.query(
    `SELECT id, province, mun_city
     FROM psgc
     WHERE TRIM(province) = $1
       AND POSITION($2 IN TRIM(mun_city)) > 0
     LIMIT 1`,
    [clientProvince, clientMunicipality]
  );

  if (result.rows.length > 0) {
    await updateClientPSGC(clientId, result.rows[0].id);
    return {
      client_id: clientId,
      psgc_id: result.rows[0].id,
      match_type: 'reverse',
      match_reason: `Client municipality "${clientMunicipality}" found in PSGC municipality "${result.rows[0].mun_city}"`,
      status: 'matched',
    };
  }

  // Strategy 3: Keyword match (remove "CITY" suffix)
  const keywordMunicipality = clientMunicipality.replace(/CITY$/g, '').trim();

  result = await pool.query(
    `SELECT id, province, mun_city
     FROM psgc
     WHERE TRIM(province) = $1
       AND REPLACE(TRIM(mun_city), 'CITY', '') = $2
     LIMIT 1`,
    [clientProvince, keywordMunicipality]
  );

  if (result.rows.length > 0) {
    await updateClientPSGC(clientId, result.rows[0].id);
    return {
      client_id: clientId,
      psgc_id: result.rows[0].id,
      match_type: 'keyword',
      match_reason: `Matched after removing "CITY" suffix`,
      status: 'matched',
    };
  }

  // Strategy 4: Advanced keyword match (remove common prefixes/suffixes)
  const advancedClientMun = clientMunicipality
    .replace(/CITY$/g, '')
    .replace(/^THE\s+/i, '')
    .replace(/^CITY\s+OF\s+/i, '')
    .trim();

  result = await pool.query(
    `SELECT id, province, mun_city
     FROM psgc
     WHERE TRIM(province) = $1
       AND REPLACE(REPLACE(REPLACE(TRIM(mun_city), 'CITY', ''), 'THE ', ''), 'CITY OF ', '') = $2
     LIMIT 1`,
    [clientProvince, advancedClientMun]
  );

  if (result.rows.length > 0) {
    await updateClientPSGC(clientId, result.rows[0].id);
    return {
      client_id: clientId,
      psgc_id: result.rows[0].id,
      match_type: 'advanced_keyword',
      match_reason: `Matched after removing common prefixes/suffixes`,
      status: 'matched',
    };
  }

  // No match found
  return {
    client_id: clientId,
    status: 'unmatched',
  };
}

/**
 * Update client with PSGC ID
 */
async function updateClientPSGC(clientId: string, psgcId: string): Promise<void> {
  await pool.query(
    'UPDATE clients SET psgc_id = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL',
    [psgcId, clientId]
  );
}

/**
 * Process PSGC matching job
 */
export async function processPSGCMatching(job: BackgroundJob): Promise<PSGCMatchingResult> {
  const { dry_run = false } = job.params;

  logger.info('psgc-job', `Starting PSGC matching job ${job.id} (dry_run: ${dry_run})`);

  // Get total clients to process
  const totalClients = await countClientsWithoutPSGC();
  logger.info('psgc-job', `Found ${totalClients} clients without PSGC ID`);

  const results: PSGCMatchResult[] = [];
  let processedCount = 0;

  // Process in batches
  for (let offset = 0; offset < totalClients; offset += BATCH_SIZE) {
    const clients = await getClientsWithoutPSGC(BATCH_SIZE, offset);

    for (const client of clients) {
      try {
        const matchResult = await matchClientToPSGC(client);

        if (!dry_run && matchResult.status === 'matched' && matchResult.psgc_id) {
          // PSGC ID was already updated in matchClientToPSGC
        }

        results.push(matchResult);
        processedCount++;

        // Update progress every 10 clients
        if (processedCount % 10 === 0) {
          const progress = Math.round((processedCount / totalClients) * 100);
          await updateProgress(job.id, progress);
          logger.debug('psgc-job', `Progress: ${progress}% (${processedCount}/${totalClients})`);
        }
      } catch (error: any) {
        logger.error('psgc-job', `Failed to match client ${client.id}: ${error.message}`);
        results.push({
          client_id: client.id,
          status: 'unmatched',
        });
      }
    }

    // Small delay between batches to prevent overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Calculate summary
  const matched = results.filter(r => r.status === 'matched');
  const unmatched = results.filter(r => r.status === 'unmatched');
  const successRate = ((matched.length / results.length) * 100).toFixed(1);

  const summary = {
    total_processed: results.length,
    matched_count: matched.length,
    unmatched_count: unmatched.length,
    success_rate: successRate,
  };

  logger.info('psgc-job', `Completed PSGC matching: ${summary.matched_count}/${summary.total_processed} matched (${summary.success_rate}%)`);

  return {
    summary,
    matched: matched.slice(0, 100), // Limit results in response
    unmatched: unmatched.slice(0, 100),
  };
}

/**
 * PSGC matching job processor
 */
export const psgcMatchingProcessor: JobProcessor = {
  type: 'psgc_matching',
  process: processPSGCMatching,
};
