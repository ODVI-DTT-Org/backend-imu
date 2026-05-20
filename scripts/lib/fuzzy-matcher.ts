import { distance } from 'fastest-levenshtein';
import type { MatchingResult } from './types.js';

/**
 * Fuzzy string matching using Levenshtein distance
 * Detects typos and minor variations
 * Threshold: 0.80 (>80% match = auto-flag)
 */
export class FuzzyMatcher {
  /**
   * Calculate Levenshtein similarity score (0-1)
   * score = 1 - (distance / max_length)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;

    const dist = distance(str1, str2);
    const maxLen = Math.max(str1.length, str2.length);
    const similarity = 1 - dist / maxLen;
    return Math.max(0, Math.min(1, similarity)); // Clamp 0-1
  }

  /**
   * Find similar names from candidates using fuzzy matching
   */
  findSimilar(
    targetName: string,
    candidates: Array<{ id: string; name: string }>,
    threshold: number = 0.80
  ): MatchingResult[] {
    if (!targetName || targetName.trim().length === 0) {
      return [];
    }

    const normalizedTarget = targetName.trim().toUpperCase();

    return candidates
      .map((candidate) => ({
        client_id: candidate.id,
        name: candidate.name,
        score: this.calculateSimilarity(normalizedTarget, candidate.name.toUpperCase()),
        method: 'fuzzy' as const,
      }))
      .filter((result) => result.score > threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Top 10 matches
  }
}
