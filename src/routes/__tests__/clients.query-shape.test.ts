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

  it('hydrates assigned clients only after selecting the ordered page ids', () => {
    const assignedRoute = source.match(/clients\.get\('\/assigned'[\s\S]*?\/\/ GET \/api\/clients\/:id/)?.[0] ?? '';

    expect(assignedRoute).toContain('const idQuery = `');
    expect(assignedRoute).toContain('const hydrateQuery = `');
    expect(assignedRoute).toContain('WHERE c.id = ANY($1::uuid[])');
    expect(assignedRoute).toContain('ORDER BY array_position($1::uuid[], c.id)');
  });

  it('does not scan touchpoint_summary JSON for visit_status filters', () => {
    const listRoutes = source.match(/clients\.get\('\/'[\s\S]*?\/\/ GET \/api\/clients\/:id/)?.[0] ?? '';

    expect(listRoutes).not.toContain('jsonb_array_elements(c.touchpoint_summary)');
    expect(listRoutes).toContain('c.touchpoint_interest_statuses &&');
  });
});
