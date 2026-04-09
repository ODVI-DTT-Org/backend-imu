import { ValidationError } from '../errors/index.js';

/**
 * Normalizes search queries for fuzzy matching
 * - Converts to lowercase
 * - Removes commas, dots, dashes
 * - Collapses multiple spaces into single space
 * - Trims leading/trailing whitespace
 *
 * @param query - The search query to normalize
 * @returns The normalized query, or empty string if input is invalid
 *
 * @throws {ValidationError} If query exceeds maximum length
 */
export function normalizeSearchQuery(query: string): string {
  // Input validation: handle null/undefined
  if (!query || typeof query !== 'string') {
    return '';
  }

  // Length validation: prevent abuse with very long strings
  const MAX_QUERY_LENGTH = 100;
  if (query.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(`Search query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`);
  }

  return query
    .toLowerCase()
    .trim()
    .replace(/[,\.\-\s]+/g, ' ')  // Replace commas, dots, dashes, and spaces with single space
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .trim();
}
