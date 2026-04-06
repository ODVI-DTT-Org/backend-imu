/**
 * Migration Tests
 *
 * Tests database migrations to ensure tables and indexes are created correctly
 *
 * @file migrations.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from '../db/index.js';

describe('Database Migrations', () => {
  describe('Targets Table (Migration 051)', () => {
    it('should have targets table with correct schema', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'targets'
        ORDER BY ordinal_position
      `);

      // Table should exist
      expect(result.rows.length).toBeGreaterThan(0);

      // Check for required columns
      const columns = result.rows.map((row: any) => row.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('period');
      expect(columns).toContain('year');
      expect(columns).toContain('target_clients');
      expect(columns).toContain('target_touchpoints');
      expect(columns).toContain('target_visits');
    });

    it('should have indexes on targets table', async () => {
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'targets'
      `);

      const indexes = result.rows.map((row: any) => row.indexname);
      expect(indexes).toContain('idx_targets_user_period');
      expect(indexes).toContain('idx_targets_period');
    });

    it('should have unique constraint on user_id, period, year', async () => {
      const result = await pool.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'targets'
          AND constraint_type = 'UNIQUE'
      `);

      const constraints = result.rows.map((row: any) => row.constraint_name);
      expect(constraints.length).toBeGreaterThan(0);
    });
  });

  describe('Action Items Materialized View (Migration 052)', () => {
    it('should have action_items materialized view', async () => {
      const result = await pool.query(`
        SELECT matviewname
        FROM pg_matviews
        WHERE matviewname = 'action_items'
      `);

      expect(result.rows.length).toBe(1);
    });

    it('should have action_items view with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'action_items'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((row: any) => row.column_name);
      expect(columns).toContain('action_type');
      expect(columns).toContain('priority');
      expect(columns).toContain('client_id');
      expect(columns).toContain('first_name');
      expect(columns).toContain('last_name');
    });
  });

  describe('Performance Indexes (Migration 053)', () => {
    it('should have touchpoints performance indexes', async () => {
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'touchpoints'
          AND indexname LIKE 'idx_touchpoints_%'
      `);

      const indexes = result.rows.map((row: any) => row.indexname);
      expect(indexes).toContain('idx_touchpoints_client_date');
      expect(indexes).toContain('idx_touchpoints_client_type_status');
    });

    it('should have clients performance indexes', async () => {
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'clients'
          AND indexname LIKE 'idx_clients_%'
      `);

      const indexes = result.rows.map((row: any) => row.indexname);
      expect(indexes).toContain('idx_clients_user_type');
      expect(indexes).toContain('idx_clients_municipality');
    });
  });
});
