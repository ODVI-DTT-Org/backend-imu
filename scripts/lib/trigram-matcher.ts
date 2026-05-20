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
    threshold: number = 0.85
  ): Promise<MatchingResult[]> {
    if (!targetName || targetName.trim().length === 0) {
      return [];
    }

    const normalizedName = targetName.trim().toUpperCase();

    try {
      const query = `
        SELECT
          c.id as client_id,
          COALESCE(c.fullname, CONCAT(c.first_name, ' ', c.last_name)) as name,
          SIMILARITY(COALESCE(c.fullname, CONCAT(c.first_name, ' ', c.last_name)), $1) as score
        FROM clients c
        WHERE c.id != $2
          AND c.deleted_at IS NULL
          AND SIMILARITY(COALESCE(c.fullname, CONCAT(c.first_name, ' ', c.last_name)), $1) > $3
        ORDER BY score DESC
        LIMIT 10
      `;

      const result = await this.db.query(query, [normalizedName, excludeId, threshold]);

      return result.rows.map((row: any) => ({
        client_id: row.client_id,
        name: row.name,
        score: Math.min(row.score, 1.0), // Cap at 1.0
        method: 'trigram' as const,
      }));
    } catch (error) {
      console.error(`[TrigramMatcher] Error finding similar clients for "${targetName}":`, error);
      return [];
    }
  }
}
