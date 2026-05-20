import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../services/fcm.service.js', () => ({
  sendFcmPushToUser: vi.fn(),
}));

import { pool } from '../../db/index.js';
import {
  cleanupOldNotifications,
  clearNotifications,
  clearReadNotifications,
} from '../../services/notification.service.js';

describe('cleanupOldNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes notifications older than the retention window', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 7, rows: [] } as any);

    const deleted = await cleanupOldNotifications(3);

    expect(deleted).toBe(7);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("created_at < NOW() - ($1::int * INTERVAL '1 day')"),
      [3],
    );
  });

  it('rejects invalid retention windows', async () => {
    await expect(cleanupOldNotifications(0)).rejects.toThrow('retentionDays must be at least 1');
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('clearNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes only notifications owned by the user', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 5, rows: [] } as any);

    const deleted = await clearNotifications('user-123');

    expect(deleted).toBe(5);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM notifications'),
      ['user-123'],
    );
    expect(vi.mocked(pool.query).mock.calls[0][0]).toContain('WHERE user_id = $1');
  });
});

describe('clearReadNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes only read notifications owned by the user', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 3, rows: [] } as any);

    const deleted = await clearReadNotifications('user-123');

    expect(deleted).toBe(3);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM notifications'),
      ['user-123'],
    );
    expect(vi.mocked(pool.query).mock.calls[0][0]).toContain('WHERE user_id = $1');
    expect(vi.mocked(pool.query).mock.calls[0][0]).toContain('read_at IS NOT NULL');
  });
});
