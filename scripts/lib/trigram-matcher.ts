import { QueryResult } from 'pg';
import type { MatchingResult, ClientRecord } from './types.js';

/**
 * Trigram similarity matching using PostgreSQL pg_trgm extension
 * Requires: CREATE EXTENSION pg_trgm; in PostgreSQL
 * Fast string similarity detection for obvious duplicates
 */
export class TrigramMatcher {
  private db: any; // PostgreSQL connection pool

  constructor(dbPool: any) {
    this.db = dbPool;
  }

  /**
   * Find clients similar to target using trigram similarity
   * Threshold: 0.85 (>85% match = auto-flag)
   */
  async findSimilar(
    targetName: string,
    excludeId: string,
    threshold: number = 0.5,
    limit: number = 30
  ): Promise<MatchingResult[]> {
    const name = targetName?.trim();
    if (!name) {
      return [];
    }

    // The `%` operator is accelerated by the GIN trigram index
    // idx_clients_full_name_trgm on the generated clients.full_name column
    // (migration 053). It prefilters to rows above pg_trgm.similarity_threshold
    // (default 0.3), so similarity() is only computed on that small candidate set
    // rather than a full scan of every client. We then enforce an explicit minimum.
    const minScore = Math.max(threshold, 0.3);

    try {
      const query = `
        SELECT
          c.id AS client_id,
          c.full_name AS name,
          similarity(c.full_name, $1) AS score
        FROM clients c
        WHERE c.id != $2
          AND c.deleted_at IS NULL
          AND c.full_name % $1
          AND similarity(c.full_name, $1) >= $3
        ORDER BY score DESC
        LIMIT $4
      `;

      const result = await this.db.query(query, [name, excludeId, minScore, limit]);

      return result.rows.map((row: any) => ({
        client_id: row.client_id,
        name: row.name,
        score: Math.min(Number(row.score), 1.0), // Cap at 1.0
        method: 'trigram' as const,
      }));
    } catch (error) {
      console.error(`[TrigramMatcher] Error finding similar clients for "${targetName}":`, error);
      return [];
    }
  }
}
