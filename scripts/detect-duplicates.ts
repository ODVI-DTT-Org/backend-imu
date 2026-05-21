import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { TrigramMatcher } from './lib/trigram-matcher.js';
import { FuzzyMatcher } from './lib/fuzzy-matcher.js';
import { AIValidator } from './lib/ai-validator.js';
import { MetadataBuilder } from './lib/metadata-builder.js';
import { DBClient } from './lib/db-client.js';
import type { ScriptOptions, ClientRecord, MatchingResult } from './lib/types.js';

/**
 * Main duplicate detection script
 * Processes clients in batches and flags potential duplicates
 */
async function main() {
  // Parse command-line arguments
  const argv = await yargs(hideBin(process.argv))
    .option('all', {
      alias: 'a',
      type: 'boolean',
      default: false,
      description: 'Recheck all clients (not just new ones)',
    })
    .option('batch-size', {
      alias: 'b',
      type: 'number',
      default: 100,
      description: 'Process N clients per batch',
    })
    .option('dry-run', {
      alias: 'd',
      type: 'boolean',
      default: false,
      description: 'Preview changes without writing to DB',
    })
    .option('ai-disabled', {
      type: 'boolean',
      default: false,
      description: 'Skip AI validation (use fuzzy/trigram only)',
    })
    .parse();

  const options: ScriptOptions = {
    all: argv.all,
    batchSize: argv['batch-size'],
    dryRun: argv['dry-run'],
    aiDisabled: argv['ai-disabled'],
  };

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL environment variable not set');
    process.exit(1);
  }

  if (!options.aiDisabled && !process.env.OPENAI_API_KEY) {
    console.warn('WARNING: OPENAI_API_KEY not set. AI validation will be skipped.');
    options.aiDisabled = true;
  }

  const db = new DBClient(dbUrl);
  const trigramMatcher = new TrigramMatcher(db['pool']);
  const fuzzyMatcher = new FuzzyMatcher();
  const aiValidator = !options.aiDisabled ? new AIValidator(process.env.OPENAI_API_KEY!) : null;
  const metadataBuilder = new MetadataBuilder();

  let processedCount = 0;
  let duplicateCount = 0;
  let aiValidationCount = 0;

  try {
    console.log(`[${new Date().toISOString()}] Starting duplicate detection...`);
    console.log(
      `Options: all=${options.all}, batch-size=${options.batchSize}, dry-run=${options.dryRun}, ai=${!options.aiDisabled}`
    );

    // Get statistics
    const stats = await db.getStatistics();
    console.log(
      `Database: ${stats.total_clients} total clients, ${stats.clients_with_duplicates} previously flagged`
    );

    // Process clients in batches
    let batchNum = 1;
    let clientsToProcess: ClientRecord[] = [];

    do {
      // Fetch next batch
      clientsToProcess = await db.getClientsToCheck(options.all, options.batchSize);

      if (clientsToProcess.length === 0) {
        break;
      }

      console.log(
        `[${new Date().toISOString()}] Batch ${batchNum}: Processing ${clientsToProcess.length} clients...`
      );

      // Process each client in the batch
      for (const client of clientsToProcess) {
        const name =
          client.fullname || `${client.first_name} ${client.last_name}`.trim();

        // Step 1: Generate candidates via the indexed trigram query (fast — no
        // full-table scan and no loading every client into memory). Cast a
        // modestly wide net; the precise flag thresholds are applied below.
        const candidates = await trigramMatcher.findSimilar(name, client.id, 0.5, 30);

        // Step 2: Apply the duplicate criteria against this small candidate set
        // only: strong trigram matches (>=0.85) plus Levenshtein matches (>=0.8).
        // Preserves the original detection rules without the O(n^2) brute force.
        const strongTrigram = candidates.filter((m) => m.score >= 0.85);
        const fuzzyMatches = fuzzyMatcher.findSimilar(
          name,
          candidates.map((c) => ({ id: c.client_id, name: c.name })),
          0.8
        );
        const byId = new Map<string, MatchingResult>();
        for (const m of strongTrigram) byId.set(m.client_id, m);
        for (const m of fuzzyMatches) {
          if (!byId.has(m.client_id)) byId.set(m.client_id, m);
        }
        let finalMatches: MatchingResult[] = [...byId.values()];

        // Step 3: AI validation for borderline cases (60-80%). Fetch only the
        // candidate records by id rather than every client.
        let aiWasInvoked = false;
        if (aiValidator && !options.aiDisabled) {
          const borderlineMatches = finalMatches.filter((m) => m.score >= 0.6 && m.score < 0.8);
          if (borderlineMatches.length > 0) {
            const others = await db.getClientsByIds(borderlineMatches.map((m) => m.client_id));
            const othersById = new Map(others.map((o) => [o.id, o]));

            for (const borderlineMatch of borderlineMatches) {
              const otherClient = othersById.get(borderlineMatch.client_id);
              if (!otherClient) continue;

              const aiResult = await aiValidator.validate(client, otherClient);

              if (aiResult === 'yes') {
                borderlineMatch.method = 'ai';
                borderlineMatch.score = 0.75; // Assign confidence from AI decision
                aiWasInvoked = true;
                aiValidationCount++;
              } else if (aiResult === 'no') {
                // Remove from matches
                finalMatches = finalMatches.filter((m) => m.client_id !== borderlineMatch.client_id);
              } else {
                // 'unsure' - keep as-is
                aiWasInvoked = true;
              }
            }
          }
        }

        // Build and store metadata
        const metadata = metadataBuilder.buildMetadata(finalMatches, aiWasInvoked);

        // Validate metadata before saving
        if (!metadataBuilder.validate(metadata)) {
          console.error(`[ERROR] Invalid metadata for client ${client.id}, skipping update`);
          continue;
        }

        await db.updateClientMetadata(client.id, metadata, options.dryRun);

        processedCount++;
        if (metadata.is_possible_duplicate) {
          duplicateCount++;
        }

        // Rate limiting for AI calls
        if (aiWasInvoked) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      batchNum++;
    } while (clientsToProcess.length === options.batchSize);

    // Print final statistics
    console.log(`[${new Date().toISOString()}] Complete!`);
    console.log(`Processed: ${processedCount} clients`);
    console.log(`Found: ${duplicateCount} possible duplicates`);
    if (aiValidator) {
      console.log(`AI validations: ${aiValidator.getApiCallCount()}`);
    }

    if (options.dryRun) {
      console.log('(Dry run - no changes written to database)');
    }

    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] Script failed:`, error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run the script
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
