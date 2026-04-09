/**
 * Multi-Word Fuzzy Search Utility v2
 *
 * Simplified approach using PostgreSQL's string_to_array andunnest
 * for better 4-5 word search handling.
 */

import { normalizeSearchQuery } from './search-normalizer.js';

export interface MultiWordSearchConfig {
  /** Minimum percentage of words that must match (0.0-1.0) */
  minMatchPercentage?: number;
  /** Maximum words before switching to word-level search */
  wordThreshold?: number;
}

const DEFAULT_CONFIG: Required<MultiWordSearchConfig> = {
  minMatchPercentage: 0.5,
  wordThreshold: 3,
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
    .filter(w => w.length >= 2)
    .filter((w, i, arr) => arr.indexOf(w) === i);

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (words.length <= finalConfig.wordThreshold) {
    return {
      strategy: 'simple',
      words,
      minMatches: words.length,
      normalizedQuery: normalizedSearch,
    };
  }

  const minMatches = Math.max(
    Math.ceil(words.length * finalConfig.minMatchPercentage),
    2
  );

  return {
    strategy: 'multi-word',
    words,
    minMatches,
    normalizedQuery: normalizedSearch,
  };
}

/**
 * Build SQL WHERE clause for multi-word search using ARRAY approach
 */
export function buildMultiWordSearchClause(
  parsedSearch: ReturnType<typeof parseSearchQuery>,
  paramIndex: number,
  tableName: string = 'c'
): {
  whereClause: string;
  params: (string | number)[];
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

  // Build array of word parameters
  const wordParams: string[] = [];
  for (let i = 0; i < words.length; i++) {
    wordParams.push(`$${paramIndex + i}`);
  }

  const params: (string | number)[] = [...words];

  // Build word matching condition usingunnest and array
  // Count how many words match in the full_name
  const wordMatchCount = `
    (
      SELECT COUNT(DISTINCT word)
      FROM unnest(ARRAY[${wordParams.join(', ')}]) AS word
      WHERE ${tableName}.full_name % word
         OR ${tableName}.first_name % word
         OR ${tableName}.last_name % word
         OR ${tableName}.middle_name % word
    )
  `;

  const whereClause = `${wordMatchCount} >= $${paramIndex + words.length}`;
  params.push(minMatches);

  return {
    whereClause,
    params,
    newParamIndex: paramIndex + words.length + 1,
    similaritySelect: `, ${wordMatchCount} as word_match_count`,
    orderBy: `${wordMatchCount} DESC`,
  };
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
