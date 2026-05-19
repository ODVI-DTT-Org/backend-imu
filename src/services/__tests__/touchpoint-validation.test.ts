import { describe, expect, it } from 'vitest';
import { getNextTouchpointNumber } from '../touchpoint-validation.js';

describe('getNextTouchpointNumber', () => {
  it('uses the max touchpoint number from table rows and touchpoint_summary entries', async () => {
    const db = {
      query: async () => ({ rows: [{ next_number: 6 }] }),
    };

    await expect(getNextTouchpointNumber(db, 'client-id')).resolves.toBe(6);
  });

  it('reads both touchpoint_summary number and touchpoint_number keys', async () => {
    let sql = '';
    const db = {
      query: async (query: string) => {
        sql = query;
        return { rows: [{ next_number: 4 }] };
      },
    };

    await getNextTouchpointNumber(db, 'client-id');

    expect(sql).toContain("entry->>'touchpoint_number'");
    expect(sql).toContain("entry->>'number'");
  });
});
