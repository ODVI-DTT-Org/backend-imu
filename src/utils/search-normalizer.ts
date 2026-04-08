/**
 * Normalizes search queries for fuzzy matching
 * - Converts to lowercase
 * - Removes commas, dots, dashes
 * - Collapses multiple spaces into single space
 * - Trims leading/trailing whitespace
 */
export function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[,\.\-\s]+/g, ' ')  // Replace commas, dots, dashes, and spaces with single space
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .trim();
}
