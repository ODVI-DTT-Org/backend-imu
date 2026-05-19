import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('release approval audit writes', () => {
  test('approved release inserts include approved_by and approved_at', () => {
    const approvalsRoute = readFileSync(
      resolve(process.cwd(), 'src/routes/approvals.ts'),
      'utf8',
    );

    const approvedReleaseInserts = approvalsRoute.match(
      /INSERT INTO releases \([\s\S]*?\)\s*VALUES \([\s\S]*?'approved'[\s\S]*?\)/g,
    ) ?? [];

    expect(approvedReleaseInserts.length).toBeGreaterThan(0);
    for (const insert of approvedReleaseInserts) {
      expect(insert).toContain('approved_by');
      expect(insert).toContain('approved_at');
    }
  });
});
