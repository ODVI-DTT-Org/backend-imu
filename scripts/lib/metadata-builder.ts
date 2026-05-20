import type { DuplicateMetadata, MatchingResult } from './types.js';

/**
 * Constructs the duplicate_metadata JSONB object
 * Handles confidence score calculation and similar client formatting
 */
export class MetadataBuilder {
  /**
   * Calculate confidence score (0-100) from matching results
   * Uses max score of all matches
   */
  private calculateConfidenceScore(matches: MatchingResult[]): number {
    if (matches.length === 0) return 0;
    const maxScore = Math.max(...matches.map((m) => m.score));
    return Math.round(maxScore * 100);
  }

  /**
   * Build complete metadata object from matching results
   */
  buildMetadata(
    matches: MatchingResult[],
    aiWasInvoked: boolean = false
  ): DuplicateMetadata {
    const isPossibleDuplicate = matches.length > 0;
    const confidenceScore = this.calculateConfidenceScore(matches);

    // Sort matches by score (highest first)
    const sortedMatches = [...matches].sort((a, b) => b.score - a.score);

    return {
      is_possible_duplicate: isPossibleDuplicate,
      confidence_score: confidenceScore,
      similar_clients: sortedMatches.map((match) => ({
        id: match.client_id,
        name: match.name,
        similarity_method: match.method,
        score: Math.round(match.score * 100) / 100, // Round to 2 decimals
      })),
      ai_flagged: aiWasInvoked,
      last_checked_at: new Date().toISOString(),
    };
  }

  /**
   * Validate metadata structure
   * Returns true if valid, false otherwise
   */
  validate(metadata: DuplicateMetadata): boolean {
    if (typeof metadata.is_possible_duplicate !== 'boolean') return false;
    if (typeof metadata.confidence_score !== 'number') return false;
    if (metadata.confidence_score < 0 || metadata.confidence_score > 100) return false;
    if (!Array.isArray(metadata.similar_clients)) return false;
    if (typeof metadata.ai_flagged !== 'boolean') return false;
    if (typeof metadata.last_checked_at !== 'string') return false;

    // Validate each similar client
    for (const client of metadata.similar_clients) {
      if (typeof client.id !== 'string') return false;
      if (typeof client.name !== 'string') return false;
      if (!['trigram', 'fuzzy', 'ai'].includes(client.similarity_method)) return false;
      if (typeof client.score !== 'number' || client.score < 0 || client.score > 1) return false;
    }

    return true;
  }
}
