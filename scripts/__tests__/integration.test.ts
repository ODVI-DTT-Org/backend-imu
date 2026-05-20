import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DBClient } from '../lib/db-client';
import { TrigramMatcher } from '../lib/trigram-matcher';
import { FuzzyMatcher } from '../lib/fuzzy-matcher';
import { MetadataBuilder } from '../lib/metadata-builder';
import type { ClientRecord } from '../lib/types';

describe('Duplicate Detection Integration', () => {
  let dbClient: DBClient;
  let trigramMatcher: TrigramMatcher;
  let fuzzyMatcher: FuzzyMatcher;
  let metadataBuilder: MetadataBuilder;

  beforeEach(async () => {
    // Note: This test assumes a test database is available
    const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!testDbUrl) {
      console.warn('Skipping integration tests - database not configured');
      return;
    }

    dbClient = new DBClient(testDbUrl);
    trigramMatcher = new TrigramMatcher((dbClient as any).pool);
    fuzzyMatcher = new FuzzyMatcher();
    metadataBuilder = new MetadataBuilder();
  });

  afterEach(async () => {
    if (dbClient) {
      await dbClient.close();
    }
  });

  it('should process a batch of clients without errors', async () => {
    if (!dbClient) {
      console.warn('Skipping - database not configured');
      return;
    }

    const clients = await dbClient.getClientsToCheck(false, 5);

    if (clients.length === 0) {
      console.warn('No clients available for integration test');
      return;
    }

    for (const client of clients) {
      const nameForComparison = client.fullname || `${client.first_name} ${client.last_name}`.trim();

      // This should not throw
      const trigramResults = await trigramMatcher.findSimilar(nameForComparison, client.id);

      expect(Array.isArray(trigramResults)).toBe(true);

      const metadata = metadataBuilder.buildMetadata(trigramResults);
      expect(metadataBuilder.validate(metadata)).toBe(true);
    }
  });

  it('should handle clients with missing name fields', async () => {
    if (!dbClient) {
      console.warn('Skipping - database not configured');
      return;
    }

    const mockClient: ClientRecord = {
      id: 'test-id',
      fullname: null,
      first_name: '',
      last_name: '',
    };

    const nameForComparison = mockClient.fullname || `${mockClient.first_name} ${mockClient.last_name}`.trim();
    const results = await trigramMatcher.findSimilar(nameForComparison, mockClient.id);

    expect(results).toEqual([]);
  });

  it('should retrieve database statistics', async () => {
    if (!dbClient) {
      console.warn('Skipping - database not configured');
      return;
    }

    const stats = await dbClient.getStatistics();

    expect(typeof stats.total_clients).toBe('number');
    expect(typeof stats.clients_with_duplicates).toBe('number');
    expect(typeof stats.clients_ai_flagged).toBe('number');
    expect(stats.total_clients).toBeGreaterThanOrEqual(0);
    expect(stats.clients_with_duplicates).toBeGreaterThanOrEqual(0);
    expect(stats.clients_ai_flagged).toBeGreaterThanOrEqual(0);
  });
});
