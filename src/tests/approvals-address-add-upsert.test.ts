import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, test } from 'vitest';

describe('address_add approval handling', () => {
  test('single and bulk approval paths upsert same-type addresses', () => {
    const approvalsRoute = readFileSync(
      resolve(process.cwd(), 'src/routes/approvals.ts'),
      'utf8',
    );

    const addressAddInserts = approvalsRoute.match(
      /INSERT INTO addresses \([\s\S]*?\)\s*VALUES \([\s\S]*?\)\s*ON CONFLICT \(client_id, type\) WHERE deleted_at IS NULL\s*DO UPDATE SET/g,
    ) ?? [];

    expect(addressAddInserts.length).toBeGreaterThanOrEqual(2);
    expect(approvalsRoute).toContain(
      'full_address = COALESCE(EXCLUDED.full_address, addresses.full_address)',
    );
    expect(approvalsRoute).toContain(
      'psgc_id = COALESCE(EXCLUDED.psgc_id, addresses.psgc_id)',
    );
    expect(approvalsRoute).toContain(
      'is_primary = addresses.is_primary OR EXCLUDED.is_primary',
    );
  });
});
