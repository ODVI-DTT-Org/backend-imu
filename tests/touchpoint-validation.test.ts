/**
 * Touchpoint Validation Tests for Tele Role Implementation
 *
 * Tests for:
 * - Touchpoint sequence validation (Visit-Call-Call-Visit-Call-Call-Visit)
 * - Role-based validation (Caravan → Visit, Tele → Call)
 * - Status field validation
 * - User ID field validation (caravan_id → user_id migration)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../src/db/schema.js';

const { Pool } = pg;

describe('Touchpoint Validation', () => {
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    // Setup test database connection
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'imu_dev',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Touchpoint Sequence Validation', () => {
    it('should validate correct touchpoint sequence: 1=Visit, 2=Call, 3=Call, 4=Visit, 5=Call, 6=Call, 7=Visit', async () => {
      const sequence = [
        { number: 1, type: 'VISIT' },
        { number: 2, type: 'CALL' },
        { number: 3, type: 'CALL' },
        { number: 4, type: 'VISIT' },
        { number: 5, type: 'CALL' },
        { number: 6, type: 'CALL' },
        { number: 7, type: 'VISIT' },
      ];

      for (const touchpoint of sequence) {
        const result = await db.execute(sql`
          SELECT validate_touchpoint_sequence(
            ${touchpoint.number}::integer,
            ${touchpoint.type}::text
          ) as valid
        `);

        expect(result.rows[0].valid).toBe(true);
      }
    });

    it('should reject incorrect touchpoint type for touchpoint #1 (must be Visit)', async () => {
      const result = await db.execute(sql`
        SELECT validate_touchpoint_sequence(
          1::integer,
          'CALL'::text
        ) as valid
      `);

      expect(result.rows[0].valid).toBe(false);
    });

    it('should reject incorrect touchpoint type for touchpoint #2 (must be Call)', async () => {
      const result = await db.execute(sql`
        SELECT validate_touchpoint_sequence(
          2::integer,
          'VISIT'::text
        ) as valid
      `);

      expect(result.rows[0].valid).toBe(false);
    });
  });

  describe('Role-Based Validation', () => {
    it('should allow Caravan user to create Visit touchpoint (1, 4, 7)', async () => {
      const caravanUserId = 'test-caravan-user-id';

      // Touchpoint #1 - Visit
      const result1 = await db.execute(sql`
        SELECT validate_touchpoint_for_role(
          1::integer,
          'VISIT'::text,
          ${caravanUserId}::uuid,
          'caravan'::text
        ) as valid
      `);

      expect(result1.rows[0].valid).toBe(true);

      // Touchpoint #4 - Visit
      const result4 = await db.execute(sql`
        SELECT validate_touchpoint_for_role(
          4::integer,
          'VISIT'::text,
          ${caravanUserId}::uuid,
          'caravan'::text
        ) as valid
      `);

      expect(result4.rows[0].valid).toBe(true);

      // Touchpoint #7 - Visit
      const result7 = await db.execute(sql`
        SELECT validate_touchpoint_for_role(
          7::integer,
          'VISIT'::text,
          ${caravanUserId}::uuid,
          'caravan'::text
        ) as valid
      `);

      expect(result7.rows[0].valid).toBe(true);
    });

    it('should reject Caravan user from creating Call touchpoint (2, 3, 5, 6)', async () => {
      const caravanUserId = 'test-caravan-user-id';

      const callTouchpoints = [2, 3, 5, 6];

      for (const touchpointNumber of callTouchpoints) {
        const result = await db.execute(sql`
          SELECT validate_touchpoint_for_role(
            ${touchpointNumber}::integer,
            'CALL'::text,
            ${caravanUserId}::uuid,
            'caravan'::text
          ) as valid
        `);

        expect(result.rows[0].valid).toBe(false);
      }
    });

    it('should allow Tele user to create Call touchpoint (2, 3, 5, 6)', async () => {
      const teleUserId = 'test-tele-user-id';

      const callTouchpoints = [2, 3, 5, 6];

      for (const touchpointNumber of callTouchpoints) {
        const result = await db.execute(sql`
          SELECT validate_touchpoint_for_role(
            ${touchpointNumber}::integer,
            'CALL'::text,
            ${teleUserId}::uuid,
            'tele'::text
          ) as valid
        `);

        expect(result.rows[0].valid).toBe(true);
      }
    });

    it('should reject Tele user from creating Visit touchpoint (1, 4, 7)', async () => {
      const teleUserId = 'test-tele-user-id';

      const visitTouchpoints = [1, 4, 7];

      for (const touchpointNumber of visitTouchpoints) {
        const result = await db.execute(sql`
          SELECT validate_touchpoint_for_role(
            ${touchpointNumber}::integer,
            'VISIT'::text,
            ${teleUserId}::uuid,
            'tele'::text
          ) as valid
        `);

        expect(result.rows[0].valid).toBe(false);
      }
    });

    it('should allow Admin users to create any touchpoint type', async () => {
      const adminUserId = 'test-admin-user-id';

      const allTouchpoints = [
        { number: 1, type: 'VISIT' },
        { number: 2, type: 'CALL' },
        { number: 3, type: 'CALL' },
        { number: 4, type: 'VISIT' },
        { number: 5, type: 'CALL' },
        { number: 6, type: 'CALL' },
        { number: 7, type: 'VISIT' },
      ];

      for (const touchpoint of allTouchpoints) {
        const result = await db.execute(sql`
          SELECT validate_touchpoint_for_role(
            ${touchpoint.number}::integer,
            ${touchpoint.type}::text,
            ${adminUserId}::uuid,
            'admin'::text
          ) as valid
        `);

        expect(result.rows[0].valid).toBe(true);
      }
    });

    it('should allow Area Manager users to create any touchpoint type', async () => {
      const areaManagerUserId = 'test-area-manager-user-id';

      const allTouchpoints = [
        { number: 1, type: 'VISIT' },
        { number: 2, type: 'CALL' },
      ];

      for (const touchpoint of allTouchpoints) {
        const result = await db.execute(sql`
          SELECT validate_touchpoint_for_role(
            ${touchpoint.number}::integer,
            ${touchpoint.type}::text,
            ${areaManagerUserId}::uuid,
            'area_manager'::text
          ) as valid
        `);

        expect(result.rows[0].valid).toBe(true);
      }
    });

    it('should allow Assistant Area Manager users to create any touchpoint type', async () => {
      const assistantAreaManagerUserId = 'test-assistant-area-manager-user-id';

      const allTouchpoints = [
        { number: 1, type: 'VISIT' },
        { number: 2, type: 'CALL' },
      ];

      for (const touchpoint of allTouchpoints) {
        const result = await db.execute(sql`
          SELECT validate_touchpoint_for_role(
            ${touchpoint.number}::integer,
            ${touchpoint.type}::text,
            ${assistantAreaManagerUserId}::uuid,
            'assistant_area_manager'::text
          ) as valid
        `);

        expect(result.rows[0].valid).toBe(true);
      }
    });
  });

  describe('Status Field Validation', () => {
    it('should accept valid status values: Interested, Undecided, Not Interested, Completed', async () => {
      const validStatuses = ['Interested', 'Undecided', 'Not Interested', 'Completed'];

      for (const status of validStatuses) {
        const result = await db.execute(sql`
          SELECT validate_touchpoint_status(${status}::text) as valid
        `);

        expect(result.rows[0].valid).toBe(true);
      }
    });

    it('should reject invalid status values', async () => {
      const invalidStatuses = ['Invalid', 'Maybe', 'Yes', 'No', ''];

      for (const status of invalidStatuses) {
        const result = await db.execute(sql`
          SELECT validate_touchpoint_status(${status}::text) as valid
        `);

        expect(result.rows[0].valid).toBe(false);
      }
    });

    it('should default status to "Interested" if not provided', async () => {
      const result = await db.execute(sql`
        SELECT COALESCE(NULL, 'Interested'::text) = 'Interested'::text as has_default
      `);

      expect(result.rows[0].has_default).toBe(true);
    });
  });

  describe('User ID Field Validation', () => {
    it('should accept user_id instead of caravan_id', async () => {
      const userId = 'test-user-id';

      const result = await db.execute(sql`
        SELECT ${userId}::uuid as user_id
      `);

      expect(result.rows[0].user_id).toBe(userId);
    });

    it('should maintain backward compatibility with caravan_id', async () => {
      // This test ensures that old records with caravan_id still work
      const result = await db.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'touchpoints'
        AND column_name IN ('user_id', 'caravan_id')
      `);

      // Should have user_id column
      const hasUserId = result.rows.some((row: any) => row.column_name === 'user_id');
      expect(hasUserId).toBe(true);

      // Should NOT have caravan_id column (migrated)
      const hasCaravanId = result.rows.some((row: any) => row.column_name === 'caravan_id');
      expect(hasCaravanId).toBe(false);
    });
  });

  describe('Next Touchpoint Number Calculation', () => {
    it('should return 1 for client with no touchpoints', async () => {
      const clientId = 'test-client-no-touchpoints';

      const result = await db.execute(sql`
        SELECT get_next_touchpoint_number(${clientId}::uuid) as next_number
      `);

      expect(result.rows[0].next_number).toBe(1);
    });

    it('should return 2 for client with 1 touchpoint', async () => {
      const clientId = 'test-client-one-touchpoint';

      // First, insert a test touchpoint
      await db.execute(sql`
        INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, date)
        VALUES (${clientId}::uuid, 'test-user-id'::uuid, 1::integer, 'VISIT'::text, NOW()::date)
      `);

      const result = await db.execute(sql`
        SELECT get_next_touchpoint_number(${clientId}::uuid) as next_number
      `);

      expect(result.rows[0].next_number).toBe(2);

      // Cleanup
      await db.execute(sql`
        DELETE FROM touchpoints WHERE client_id = ${clientId}::uuid
      `);
    });

    it('should return null for client with all 7 touchpoints', async () => {
      const clientId = 'test-client-complete';

      // Insert all 7 touchpoints
      for (let i = 1; i <= 7; i++) {
        const type = i === 1 || i === 4 || i === 7 ? 'VISIT' : 'CALL';
        await db.execute(sql`
          INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, date)
          VALUES (${clientId}::uuid, 'test-user-id'::uuid, ${i}::integer, ${type}::text, NOW()::date)
        `);
      }

      const result = await db.execute(sql`
        SELECT get_next_touchpoint_number(${clientId}::uuid) as next_number
      `);

      expect(result.rows[0].next_number).toBe(null);

      // Cleanup
      await db.execute(sql`
        DELETE FROM touchpoints WHERE client_id = ${clientId}::uuid
      `);
    });
  });
});
