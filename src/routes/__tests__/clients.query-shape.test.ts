import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('clients route query shape', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/clients.ts'), 'utf8');

  it('does not hydrate list endpoints with SELECT c star', () => {
    const allClientsHydrate = source.match(/const hydrateQuery = `[\s\S]*?`;/)?.[0] ?? '';
    const assignedClientsQuery = source.match(/const mainQuery = `[\s\S]*?CACHE POPULATION/)?.[0] ?? '';

    expect(allClientsHydrate).not.toContain('SELECT c.*,');
    expect(assignedClientsQuery).not.toContain('SELECT c.*,');
  });
});
