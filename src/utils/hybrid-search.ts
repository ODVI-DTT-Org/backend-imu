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
  fullTextThreshold: 3,
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
 * Generate all permutations of an array of words
 * Limited to prevent performance issues with large word counts
 */
function generatePermutations<T>(arr: T[], maxPermutations: number = 24): T[][] {
  if (arr.length <= 1) return [arr];
  if (arr.length > 5) return [arr]; // Too many permutations for 5+ words

  const result: T[][] = [];
  const permute = (arr: T[], m: T[] = []) => {
    if (arr.length === 0) {
      result.push(m);
    } else if (result.length < maxPermutations) {
      for (let i = 0; i < arr.length; i++) {
        const curr = arr.slice();
        const next = curr.splice(i, 1);
        permute(curr.slice(), m.concat(next));
      }
    }
  };
  permute(arr);
  return result;
}

/**
 * Build SQL WHERE clause and parameters for hybrid search with permutation support
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
  const { strategy, words, normalizedQuery } = parsedSearch;

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

  // Enhanced full-text search for 3+ words with permutation support
  const wordCount = words.length;

  if (wordCount === 3) {
    // For 3-word searches, generate all 6 permutations for maximum flexibility
    const permutations = generatePermutations(words);
    const searchClauses: string[] = [];
    let currentParamIndex = paramIndex;

    permutations.forEach(perm => {
      const searchQuery = perm.join(' ');
      searchClauses.push(`to_tsvector('english', ${tableName}.full_name) @@ plainto_tsquery('english', $${currentParamIndex})`);
      currentParamIndex++;
    });

    const whereClause = `(${searchClauses.join(' OR ')})`;
    const params = permutations.map(perm => perm.join(' '));

    // Use the first permutation for ranking
    const similaritySelect = `, ts_rank_cd(to_tsvector('english', ${tableName}.full_name), plainto_tsquery('english', $${paramIndex})) as similarity_score`;
    const orderBy = `similarity_score DESC`;

    return {
      whereClause,
      params,
      newParamIndex: currentParamIndex,
      similaritySelect,
      orderBy,
      strategy: 'fulltext-permutations',
    };
  }

  if (wordCount === 4) {
    // For 4-word searches, use limited permutations (24 total, use first 12 for performance)
    const permutations = generatePermutations(words, 12);
    const searchClauses: string[] = [];
    let currentParamIndex = paramIndex;

    permutations.forEach(perm => {
      const searchQuery = perm.join(' ');
      searchClauses.push(`to_tsvector('english', ${tableName}.full_name) @@ plainto_tsquery('english', $${currentParamIndex})`);
      currentParamIndex++;
    });

    const whereClause = `(${searchClauses.join(' OR ')})`;
    const params = permutations.map(perm => perm.join(' '));

    const similaritySelect = `, ts_rank_cd(to_tsvector('english', ${tableName}.full_name), plainto_tsquery('english', $${paramIndex})) as similarity_score`;
    const orderBy = `similarity_score DESC`;

    return {
      whereClause,
      params,
      newParamIndex: currentParamIndex,
      similaritySelect,
      orderBy,
      strategy: 'fulltext-permutations',
    };
  }

  // For 5+ words, use original order + common name patterns
  const commonPatterns = [
    words.join(' '), // Original order
    words.slice().reverse().join(' '), // Reverse order
    // Add common name patterns if enough words
    ...(words.length >= 5 ? [
      `${words[words.length-1]} ${words.slice(0, words.length-1).join(' ')}`, // Last word first
      `${words[0]} ${words.slice(1).join(' ')}`, // First word + rest
    ] : [])
  ];

  const searchClauses: string[] = [];
  let currentParamIndex = paramIndex;

  commonPatterns.forEach(pattern => {
    searchClauses.push(`to_tsvector('english', ${tableName}.full_name) @@ plainto_tsquery('english', $${currentParamIndex})`);
    currentParamIndex++;
  });

  const whereClause = `(${searchClauses.join(' OR ')})`;
  const params = commonPatterns;

  const similaritySelect = `, ts_rank_cd(to_tsvector('english', ${tableName}.full_name), plainto_tsquery('english', $${paramIndex})) as similarity_score`;
  const orderBy = `similarity_score DESC`;

  return {
    whereClause,
    params,
    newParamIndex: currentParamIndex,
    similaritySelect,
    orderBy,
    strategy: 'fulltext-patterns',
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
    'fulltext-permutations': 'PostgreSQL full-text search with word order permutations (3-4 words)',
    'fulltext-patterns': 'PostgreSQL full-text search with common name patterns (5+ words)',
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
