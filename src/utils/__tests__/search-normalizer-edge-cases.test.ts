import { describe, test, expect } from 'vitest';
import { normalizeSearchQuery } from '../search-normalizer.js';
import { ValidationError } from '../../errors/index.js';

describe('Search Normalizer - Edge Cases', () => {
  describe('Input Validation', () => {
    test('handles null input gracefully', () => {
      const result = normalizeSearchQuery(null as any);
      expect(result).toBe('');
    });

    test('handles undefined input gracefully', () => {
      const result = normalizeSearchQuery(undefined as any);
      expect(result).toBe('');
    });

    test('handles empty string', () => {
      const result = normalizeSearchQuery('');
      expect(result).toBe('');
    });

    test('throws ValidationError for very long strings', () => {
      const longString = 'a'.repeat(101);
      expect(() => normalizeSearchQuery(longString)).toThrow(ValidationError);
      expect(() => normalizeSearchQuery(longString)).toThrow('maximum length of 100 characters');
    });

    test('accepts string at maximum length', () => {
      const maxLengthString = 'a'.repeat(100);
      const result = normalizeSearchQuery(maxLengthString);
      expect(result).toBe(maxLengthString.toLowerCase());
    });
  });

  describe('SQL Injection Prevention', () => {
    test('normalizes SQL injection attempts (protection via parameterized queries)', () => {
      // Note: SQL injection is prevented by parameterized queries in the routes
      // The normalizer's job is to make search flexible, not to sanitize SQL
      const result = normalizeSearchQuery("Cruz' OR '1'='1");
      expect(result).toBe('cruz\' or \'1\'=\'1');
    });

    test('normalizes UNION injection attempts', () => {
      const result = normalizeSearchQuery("Cruz' UNION SELECT * FROM users--");
      expect(result).toBe('cruz\' union select * from users');
    });

    test('normalizes comment-based injection attempts', () => {
      const result = normalizeSearchQuery("Cruz' -- comment");
      expect(result).toBe('cruz\' comment');
    });

    test('normalizes semicolon injection attempts', () => {
      const result = normalizeSearchQuery("Cruz; DROP TABLE clients--");
      // Semicolons are not removed (not in the punctuation list)
      // Only commas, dots, and dashes are replaced with spaces
      expect(result).toBe('cruz; drop table clients');
    });

    test('note: actual SQL protection comes from parameterized queries', () => {
      // This test documents that SQL injection safety is achieved
      // through parameterized queries in routes/clients.ts and routes/search.ts
      // not through input sanitization
      const malicious = "'; DROP TABLE clients; --";
      const normalized = normalizeSearchQuery(malicious);
      // The normalized string still contains SQL keywords
      expect(normalized).toContain('drop');
      // But it's safe because we use parameterized queries: pool.query(sql, [params])
    });
  });

  describe('Special Characters', () => {
    test('handles multiple commas', () => {
      const result = normalizeSearchQuery("Cruz,,, Maria");
      expect(result).toBe('cruz maria');
    });

    test('handles mixed punctuation', () => {
      const result = normalizeSearchQuery("Cruz, Maria.-Santos");
      expect(result).toBe('cruz maria santos');
    });

    test('handles multiple spaces', () => {
      const result = normalizeSearchQuery("Cruz    Maria     Santos");
      expect(result).toBe('cruz maria santos');
    });

    test('handles tabs and newlines', () => {
      const result = normalizeSearchQuery("Cruz\tMaria\nSantos");
      expect(result).toMatch(/cruz maria santos/);
    });

    test('handles leading/trailing whitespace', () => {
      const result = normalizeSearchQuery("  Cruz, Maria  ");
      expect(result).toBe('cruz maria');
      expect(result).not.toMatch(/^\s/);
      expect(result).not.toMatch(/\s$/);
    });
  });

  describe('International Characters', () => {
    test('handles accented characters', () => {
      const result = normalizeSearchQuery("José María");
      expect(result).toBe('josé maría');
    });

    test('handles non-Latin characters', () => {
      const result = normalizeSearchQuery("Juan Carlos");
      expect(result).toBe('juan carlos');
    });

    test('preserves case conversion for special chars', () => {
      const result = normalizeSearchQuery("Ñúñez");
      expect(result).toBe('ñúñez');
    });
  });

  describe('Edge Cases from Real World', () => {
    test('handles "De la Cruz" format', () => {
      const result = normalizeSearchQuery("De la Cruz, Maria");
      expect(result).toBe('de la cruz maria');
    });

    test('handles "Delacruz" compound format', () => {
      const result = normalizeSearchQuery("Delacruz");
      expect(result).toBe('delacruz');
    });

    test('handles "Cruz, Maria" comma format', () => {
      const result = normalizeSearchQuery("Cruz, Maria");
      expect(result).toBe('cruz maria');
    });

    test('handles "Maria, Cruz" reversed comma format', () => {
      const result = normalizeSearchQuery("Maria, Cruz");
      expect(result).toBe('maria cruz');
    });

    test('handles email-like input (dots replaced with spaces for fuzzy matching)', () => {
      const result = normalizeSearchQuery("cruz@example.com");
      // Dots are replaced with spaces to allow "cruz example com" to match "cruz@example.com"
      expect(result).toBe('cruz@example com');
    });

    test('handles phone-like input', () => {
      const result = normalizeSearchQuery("0917-123-4567");
      expect(result).toBe('0917 123 4567');
    });
  });

  describe('Type Safety', () => {
    test('handles numeric input', () => {
      const result = normalizeSearchQuery(12345 as any);
      expect(result).toBe('');
    });

    test('handles object input', () => {
      const result = normalizeSearchQuery({ name: 'Cruz' } as any);
      expect(result).toBe('');
    });

    test('handles array input', () => {
      const result = normalizeSearchQuery(['Cruz', 'Maria'] as any);
      expect(result).toBe('');
    });
  });
});
