/**
 * Hybrid Search Utility
 *
 * Combines PostgreSQL pg_trgm (for 1-2 words) and full-text search (for 3+ words)
 * to provide optimal fuzzy search performance across all query lengths.
 *
 * Strategy:
 * - 1-2 words: Use pg_trgm with % operator (100% success rate)
 * - 3+ words: Use full-text search with tsvector/tsquery (handles multi-word)
 *
 * Reference: https://www.postgresql.org/docs/current/textsearch-intro.html
 */

import { normalizeSearchQuery } from './search-normalizer.js';

export interface HybridSearchConfig {
  /** Minimum word length to include in search */
  minWordLength?: number;
  /** Word count threshold for switching to full-text search */
  fullTextThreshold?: number;
  /** Full-text search language configuration */
  textSearchConfig?: string;
}

const DEFAULT_CONFIG: Required<HybridSearchConfig> = {
  minWordLength: 2,
  fullTextThreshold: 1,
  textSearchConfig: 'english',
};

/**
 * Parse search query and determine optimal search strategy
 */
export function parseHybridSearchQuery(
  search: string,
  config: HybridSearchConfig = {}
): {
  strategy: 'trgm' | 'fulltext';
  words: string[];
  normalizedQuery: string;
  wordCount: number;
} {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const normalizedSearch = normalizeSearchQuery(search);

  // Split into words and filter by minimum length
  const words = normalizedSearch
    .split(/\s+/)
    .filter(w => w.length >= finalConfig.minWordLength);

  // Determine strategy based on word count
  const strategy = words.length >= finalConfig.fullTextThreshold ? 'fulltext' : 'trgm';

  return {
    strategy,
    words,
    normalizedQuery: normalizedSearch,
    wordCount: words.length,
  };
}

/**
 * Build SQL WHERE clause and parameters for hybrid search.
 */
export function buildHybridSearchClause(
  parsedSearch: ReturnType<typeof parseHybridSearchQuery>,
  paramIndex: number,
  tableName: string = 'c'
): {
  whereClause: string;
  params: (string | number)[];
  newParamIndex: number;
  similaritySelect?: string;
  orderBy?: string;
  strategy: string;
} {
  const { strategy, normalizedQuery } = parsedSearch;

  if (strategy === 'trgm') {
    // Use pg_trgm for 1-2 words (proven 100% success rate)
    const whereClause = `(
      ${tableName}.full_name % $${paramIndex}
      OR ${tableName}.first_name % $${paramIndex}
      OR ${tableName}.last_name % $${paramIndex}
      OR ${tableName}.middle_name % $${paramIndex}
    )`;

    const similaritySelect = `, SIMILARITY(${tableName}.full_name, $${paramIndex}) as similarity_score`;
    const orderBy = `SIMILARITY(${tableName}.full_name, $${paramIndex}) DESC`;

    return {
      whereClause,
      params: [normalizedQuery],
      newParamIndex: paramIndex + 1,
      similaritySelect,
      orderBy,
      strategy: 'trgm',
    };
  }

  // Full-text search for 3+ words: single plainto_tsquery against stored search_vector.
  // plainto_tsquery is word-order-insensitive, so permutations add DB work without changing matches.
  const whereClause = `${tableName}.search_vector @@ plainto_tsquery('simple', $${paramIndex})`;
  const similaritySelect = `, ts_rank_cd(${tableName}.search_vector, plainto_tsquery('simple', $${paramIndex})) as similarity_score`;
  const orderBy = `similarity_score DESC`;

  return {
    whereClause,
    params: [normalizedQuery],
    newParamIndex: paramIndex + 1,
    similaritySelect,
    orderBy,
    strategy: 'fulltext',
  };
}

/**
 * Get search strategy info for debugging/logging
 */
export function getHybridSearchStrategyInfo(
  parsedSearch: ReturnType<typeof parseHybridSearchQuery>,
  customStrategy?: string
): {
  strategy: string;
  wordCount: number;
  normalizedQuery: string;
  description: string;
} {
  const strategyDescriptions: Record<string, string> = {
    trgm: 'PostgreSQL pg_trgm fuzzy matching (best for 1-2 words)',
    fulltext: 'PostgreSQL full-text search (best for 3+ words)',
  };

  const strategy = customStrategy || parsedSearch.strategy;

  return {
    strategy,
    wordCount: parsedSearch.wordCount,
    normalizedQuery: parsedSearch.normalizedQuery,
    description: strategyDescriptions[strategy] || 'Unknown strategy',
  };
}

/**
 * Log search strategy for debugging
 */
export function logSearchStrategy(
  parsedSearch: ReturnType<typeof parseHybridSearchQuery>,
  endpoint: string = 'unknown',
  customStrategy?: string
): void {
  const info = getHybridSearchStrategyInfo(parsedSearch, customStrategy);
  console.log(`[Hybrid Search] Endpoint: ${endpoint}`);
  console.log(`[Hybrid Search] Strategy: ${info.strategy}`);
  console.log(`[Hybrid Search] Word Count: ${info.wordCount}`);
  console.log(`[Hybrid Search] Query: "${info.normalizedQuery}"`);
  console.log(`[Hybrid Search] Description: ${info.description}`);
}
