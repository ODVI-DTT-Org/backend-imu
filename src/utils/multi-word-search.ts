/**
 * Multi-Word Fuzzy Search Utility
 *
 * Handles 4-5 word searches by splitting into individual words
 * and using word-level matching with minimum match requirements.
 *
 * Strategy:
 * - 1-2 words: Use standard pg_trgm similarity search (fast, accurate)
 * - 3+ words: Split into words, match each word, require minimum match percentage
 */

import { normalizeSearchQuery } from './search-normalizer.js';

export interface MultiWordSearchConfig {
  /** Minimum percentage of words that must match (0.0-1.0) */
  minMatchPercentage?: number;
  /** Maximum words before switching to word-level search */
  wordThreshold?: number;
  /** Similarity threshold for individual word matching */
  wordSimilarityThreshold?: number;
}

const DEFAULT_CONFIG: Required<MultiWordSearchConfig> = {
  minMatchPercentage: 0.5, // Require 50% of words to match
  wordThreshold: 3,        // Use word-level search for 3+ words
  wordSimilarityThreshold: 0.25, // Lower threshold for individual words
};

/**
 * Parse search query and determine search strategy
 */
export function parseSearchQuery(
  search: string,
  config: MultiWordSearchConfig = {}
): {
  strategy: 'simple' | 'multi-word';
  words: string[];
  minMatches: number;
  normalizedQuery: string;
} {
  const normalizedSearch = normalizeSearchQuery(search);
  const words = normalizedSearch
    .split(/\s+/)
    .filter(w => w.length >= 2) // Filter out single characters
    .filter((w, i, arr) => arr.indexOf(w) === i); // Remove duplicates

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Use simple strategy for 1-2 words
  if (words.length <= finalConfig.wordThreshold) {
    return {
      strategy: 'simple',
      words,
      minMatches: words.length,
      normalizedQuery: normalizedSearch,
    };
  }

  // Use multi-word strategy for 3+ words
  const minMatches = Math.max(
    Math.ceil(words.length * finalConfig.minMatchPercentage),
    2 // Always require at least 2 matches
  );

  return {
    strategy: 'multi-word',
    words,
    minMatches,
    normalizedQuery: normalizedSearch,
  };
}

/**
 * Build SQL WHERE clause for multi-word search
 *
 * @param parsedSearch - Parsed search result from parseSearchQuery
 * @param paramIndex - Starting parameter index for SQL
 * @returns Object with WHERE clause, parameters, and new paramIndex
 */
export function buildMultiWordSearchClause(
  parsedSearch: ReturnType<typeof parseSearchQuery>,
  paramIndex: number
): {
  whereClause: string;
  params: (string | number)[];
  newParamIndex: number;
  similaritySelect?: string;
  orderBy?: string;
} {
  if (parsedSearch.strategy === 'simple') {
    // Use standard similarity search for 1-2 words
    return {
      whereClause: `(c.full_name % $${paramIndex} OR c.first_name % $${paramIndex} OR c.last_name % $${paramIndex} OR c.middle_name % $${paramIndex} OR c.email ILIKE $${paramIndex + 1} OR c.phone ILIKE $${paramIndex + 1})`,
      params: [parsedSearch.normalizedQuery, `%${parsedSearch.normalizedQuery}%`],
      newParamIndex: paramIndex + 2,
      similaritySelect: `, SIMILARITY(c.full_name, $${paramIndex}) as similarity_score`,
      orderBy: `SIMILARITY(c.full_name, $${paramIndex}) DESC`,
    };
  }

  // Multi-word search: match each word individually
  const { words, minMatches } = parsedSearch;
  const wordConditions: string[] = [];
  const params: (string | number)[] = [];

  // Build condition for each word
  for (let i = 0; i < words.length; i++) {
    wordConditions.push(
      `(c.full_name % $${paramIndex + i} OR c.first_name % $${paramIndex + i} OR c.last_name % $${paramIndex + i} OR c.middle_name % $${paramIndex + i})`
    );
    params.push(words[i]);
  }

  // Combine with OR and require minimum matches
  // This uses a CASE statement to count matching words
  const matchCountExpr = wordConditions
    .map((cond, i) => `CASE WHEN ${cond} THEN 1 ELSE 0 END`)
    .join(' + ');

  const whereClause = `(${matchCountExpr}) >= $${paramIndex + words.length}`;
  params.push(minMatches);

  return {
    whereClause,
    params,
    newParamIndex: paramIndex + words.length + 1,
    similaritySelect: `, (${matchCountExpr}) as word_match_count`,
    orderBy: `(${matchCountExpr}) DESC`,
  };
}

/**
 * Build alternative multi-word search using ANY/ALL approach
 * This can be faster for large datasets
 */
export function buildAlternativeMultiWordSearchClause(
  parsedSearch: ReturnType<typeof parseSearchQuery>,
  paramIndex: number,
  tableName: string = 'c'
): {
  whereClause: string;
  params: string[];
  newParamIndex: number;
  similaritySelect?: string;
  orderBy?: string;
} {
  if (parsedSearch.strategy === 'simple') {
    return {
      whereClause: `(${tableName}.full_name % $${paramIndex} OR ${tableName}.first_name % $${paramIndex} OR ${tableName}.last_name % $${paramIndex} OR ${tableName}.middle_name % $${paramIndex} OR ${tableName}.email ILIKE $${paramIndex + 1} OR ${tableName}.phone ILIKE $${paramIndex + 1})`,
      params: [parsedSearch.normalizedQuery, `%${parsedSearch.normalizedQuery}%`],
      newParamIndex: paramIndex + 2,
      similaritySelect: `, SIMILARITY(${tableName}.full_name, $${paramIndex}) as similarity_score`,
      orderBy: `SIMILARITY(${tableName}.full_name, $${paramIndex}) DESC`,
    };
  }

  const { words, minMatches } = parsedSearch;

  // Create word array parameter for PostgreSQL
  const wordParams = words.map((_, i) => `$${paramIndex + i}`);
  const params = [...words];

  // Use unnest and array operations
  const whereClause = `
    (
      SELECT COUNT(*)
      FROM unnest(ARRAY[${wordParams.join(', ')}]) AS word
      WHERE ${tableName}.full_name % word
         OR ${tableName}.first_name % word
         OR ${tableName}.last_name % word
         OR ${tableName}.middle_name % word
    ) >= $${paramIndex + words.length}
  `;
  params.push(minMatches.toString());

  const matchCountSubquery = `
    (
      SELECT COUNT(*)
      FROM unnest(ARRAY[${wordParams.join(', ')}]) AS word
      WHERE ${tableName}.full_name % word
         OR ${tableName}.first_name % word
         OR ${tableName}.last_name % word
         OR ${tableName}.middle_name % word
    )
  `;

  return {
    whereClause,
    params,
    newParamIndex: paramIndex + words.length + 1,
    similaritySelect: `, ${matchCountSubquery} as word_match_count`,
    orderBy: `${matchCountSubquery} DESC`,
  };
}

/**
 * Calculate match percentage for display
 */
export function calculateMatchPercentage(
  matchedWords: number,
  totalWords: number
): number {
  if (totalWords === 0) return 0;
  return Math.round((matchedWords / totalWords) * 100);
}

/**
 * Get search strategy info for debugging/logging
 */
export function getSearchStrategyInfo(
  parsedSearch: ReturnType<typeof parseSearchQuery>
): {
  strategy: string;
  wordCount: number;
  minMatchesRequired: number;
  matchPercentage: number;
} {
  const matchPercentage = parsedSearch.words.length > 0
    ? Math.round((parsedSearch.minMatches / parsedSearch.words.length) * 100)
    : 0;

  return {
    strategy: parsedSearch.strategy,
    wordCount: parsedSearch.words.length,
    minMatchesRequired: parsedSearch.minMatches,
    matchPercentage,
  };
}
