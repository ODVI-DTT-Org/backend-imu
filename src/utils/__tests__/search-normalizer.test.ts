import { describe, test, expect } from 'vitest';
import { normalizeSearchQuery } from '../search-normalizer.js';

describe('normalizeSearchQuery', () => {
  test('removes extra spaces', () => {
    expect(normalizeSearchQuery('Maria  Cruz')).toBe('maria cruz');
  });

  test('converts to lowercase', () => {
    expect(normalizeSearchQuery('MARIA CRUZ')).toBe('maria cruz');
  });

  test('removes commas', () => {
    expect(normalizeSearchQuery('Cruz, Maria')).toBe('cruz maria');
  });

  test('removes dots and dashes', () => {
    expect(normalizeSearchQuery('Delacruz.Maria-Santos')).toBe('delacruz maria santos');
  });

  test('trims whitespace', () => {
    expect(normalizeSearchQuery('  maria cruz  ')).toBe('maria cruz');
  });

  test('handles multiple commas and spaces', () => {
    expect(normalizeSearchQuery('Cruz,,  Maria,,  Santos')).toBe('cruz maria santos');
  });

  test('handles empty string', () => {
    expect(normalizeSearchQuery('')).toBe('');
  });

  test('handles single word', () => {
    expect(normalizeSearchQuery('Cruz')).toBe('cruz');
  });
});
