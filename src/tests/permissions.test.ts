/**
 * Permission System Unit Tests
 *
 * These tests verify the permission middleware, database functions,
 * and permission checking logic.
 *
 * @file permissions.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getUserPermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  clearPermissionCache,
  clearAllPermissionCache,
} from '../middleware/permissions.js';
import type { PermissionRequirement } from '../types/rbac.js';
import {
  isSystemRoleSlug,
  isPermissionResource,
  isPermissionAction,
  isValidTouchpointNumber,
  canRoleCreateTouchpointType,
  SYSTEM_ROLES,
  PERMISSION_RESOURCES,
  PERMISSION_ACTIONS,
  TOUCHPOINT_TYPES,
} from '../types/rbac.js';
import { registerTestUser } from './setup.js';

describe('Permission System Unit Tests', () => {
  let testUserId: string;
  let adminUserId: string;
  let caravanUserId: string;

  beforeEach(async () => {
    // Create test user IDs (using fixed IDs for testing)
    adminUserId = 'test-admin-id';
    caravanUserId = 'test-caravan-id';
    testUserId = caravanUserId;

    // Register test users with the database mock
    registerTestUser({ id: adminUserId, email: 'test-admin@imu.local', role: 'admin' });
    registerTestUser({ id: caravanUserId, email: 'test-caravan@imu.local', role: 'caravan' });
  });

  afterEach(() => {
    // Clear permission cache
    clearAllPermissionCache();
    vi.restoreAllMocks();
  });

  describe('getUserPermissions', () => {
    it('should return permissions for admin user', async () => {
      const permissions = await getUserPermissions(adminUserId);

      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions.some((p) => p.resource === 'clients')).toBe(true);
      expect(permissions.some((p) => p.resource === 'users')).toBe(true);
    });

    it('should return limited permissions for caravan user', async () => {
      const permissions = await getUserPermissions(caravanUserId);

      expect(permissions.length).toBeGreaterThan(0);

      // Caravan should have client permissions
      expect(permissions.some((p) =>
        p.resource === 'clients' && p.action === 'create'
      )).toBe(true);

      // Caravan should have visit touchpoint permissions
      expect(permissions.some((p) =>
        p.resource === 'touchpoints' &&
        p.action === 'create' &&
        p.constraint_name === 'visit'
      )).toBe(true);

      // Caravan should NOT have call touchpoint permissions
      expect(permissions.some((p) =>
        p.resource === 'touchpoints' &&
        p.action === 'create' &&
        p.constraint_name === 'call'
      )).toBe(false);
    });

    it('should cache permissions for subsequent calls', async () => {
      const perms1 = await getUserPermissions(caravanUserId);
      const perms2 = await getUserPermissions(caravanUserId);

      // Cached permissions should be the same
      expect(perms1).toEqual(perms2);
    });

    it('should refresh cache after clearing', async () => {
      const permissions1 = await getUserPermissions(caravanUserId);
      clearPermissionCache(caravanUserId);
      const permissions2 = await getUserPermissions(caravanUserId);

      expect(permissions1).toEqual(permissions2);
    });
  });

  describe('hasPermission', () => {
    it('should return true for admin with any permission', async () => {
      const result = await hasPermission(adminUserId, 'clients', 'delete');

      expect(result).toBe(true);
    });

    it('should return true for caravan creating clients', async () => {
      const result = await hasPermission(caravanUserId, 'clients', 'create');

      expect(result).toBe(true);
    });

    it('should return false for caravan deleting clients', async () => {
      const result = await hasPermission(caravanUserId, 'clients', 'delete');

      expect(result).toBe(false);
    });

    it('should return true for caravan creating visit touchpoints', async () => {
      const result = await hasPermission(
        caravanUserId,
        'touchpoints',
        'create',
        'visit'
      );

      expect(result).toBe(true);
    });

    it('should return false for caravan creating call touchpoints', async () => {
      const result = await hasPermission(
        caravanUserId,
        'touchpoints',
        'create',
        'call'
      );

      expect(result).toBe(false);
    });

    it('should return true when constraint is null', async () => {
      const result = await hasPermission(adminUserId, 'users', 'read');

      expect(result).toBe(true);
    });

    it('should return true for matching constraint', async () => {
      const result = await hasPermission(
        caravanUserId,
        'clients',
        'update',
        'own'
      );

      expect(result).toBe(true);
    });

    it('should return false for non-matching constraint', async () => {
      const result = await hasPermission(
        caravanUserId,
        'clients',
        'update',
        'all'
      );

      expect(result).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true if user has any of the required permissions', async () => {
      const required: PermissionRequirement[] = [
        { resource: 'clients', action: 'delete' },
        { resource: 'clients', action: 'create' },
      ];

      const result = await hasAnyPermission(caravanUserId, required);

      expect(result).toBe(true); // caravan can create clients
    });

    it('should return false if user has none of the required permissions', async () => {
      const required: PermissionRequirement[] = [
        { resource: 'users', action: 'delete' },
        { resource: 'system', action: 'configure' },
      ];

      const result = await hasAnyPermission(caravanUserId, required);

      expect(result).toBe(false);
    });

    it('should return true for admin with any permissions', async () => {
      const required: PermissionRequirement[] = [
        { resource: 'any_resource', action: 'any_action' },
      ];

      const result = await hasAnyPermission(adminUserId, required);

      expect(result).toBe(true);
    });

    it('should handle empty permission array', async () => {
      const result = await hasAnyPermission(caravanUserId, []);

      expect(result).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true if user has all required permissions', async () => {
      const required: PermissionRequirement[] = [
        { resource: 'clients', action: 'create' },
        { resource: 'clients', action: 'read' },
      ];

      const result = await hasAllPermissions(caravanUserId, required);

      expect(result).toBe(true);
    });

    it('should return false if user lacks any required permission', async () => {
      const required: PermissionRequirement[] = [
        { resource: 'clients', action: 'create' },
        { resource: 'clients', action: 'delete' },
      ];

      const result = await hasAllPermissions(caravanUserId, required);

      expect(result).toBe(false); // caravan cannot delete clients
    });

    it('should return true for admin with any permissions', async () => {
      const required: PermissionRequirement[] = [
        { resource: 'system', action: 'configure' },
        { resource: 'users', action: 'delete' },
      ];

      const result = await hasAllPermissions(adminUserId, required);

      expect(result).toBe(true);
    });

    it('should handle empty permission array', async () => {
      const result = await hasAllPermissions(caravanUserId, []);

      expect(result).toBe(true);
    });
  });

  describe('Permission Cache', () => {
    it('should cache permissions correctly', async () => {
      const perms1 = await getUserPermissions(caravanUserId);
      const perms2 = await getUserPermissions(caravanUserId);

      expect(perms1).toEqual(perms2);
    });

    it('should clear cache for specific user', async () => {
      await getUserPermissions(caravanUserId);
      clearPermissionCache(caravanUserId);

      // Should fetch from database again
      const perms = await getUserPermissions(caravanUserId);
      expect(perms.length).toBeGreaterThan(0);
    });

    it('should clear all cache', async () => {
      await getUserPermissions(adminUserId);
      await getUserPermissions(caravanUserId);

      clearAllPermissionCache();

      // Should fetch from database again
      const adminPerms = await getUserPermissions(adminUserId);
      const caravanPerms = await getUserPermissions(caravanUserId);

      expect(adminPerms.length).toBeGreaterThan(0);
      expect(caravanPerms.length).toBeGreaterThan(0);
    });
  });
});

describe('Type Guards', () => {
  describe('isSystemRoleSlug', () => {
    it('should return true for valid system roles', () => {
      expect(isSystemRoleSlug('admin')).toBe(true);
      expect(isSystemRoleSlug('caravan')).toBe(true);
      expect(isSystemRoleSlug('tele')).toBe(true);
    });

    it('should return false for invalid roles', () => {
      expect(isSystemRoleSlug('field_agent')).toBe(false);
      expect(isSystemRoleSlug('superuser')).toBe(false);
      expect(isSystemRoleSlug('')).toBe(false);
    });
  });

  describe('isPermissionResource', () => {
    it('should return true for valid resources', () => {
      expect(isPermissionResource('clients')).toBe(true);
      expect(isPermissionResource('users')).toBe(true);
      expect(isPermissionResource('touchpoints')).toBe(true);
    });

    it('should return false for invalid resources', () => {
      expect(isPermissionResource('invalid')).toBe(false);
      expect(isPermissionResource('')).toBe(false);
    });
  });

  describe('isPermissionAction', () => {
    it('should return true for valid actions', () => {
      expect(isPermissionAction('create')).toBe(true);
      expect(isPermissionAction('read')).toBe(true);
      expect(isPermissionAction('delete')).toBe(true);
    });

    it('should return false for invalid actions', () => {
      expect(isPermissionAction('invalid')).toBe(false);
      expect(isPermissionAction('')).toBe(false);
    });
  });

  describe('isValidTouchpointNumber', () => {
    it('should return true for valid visit numbers', () => {
      expect(isValidTouchpointNumber(1, TOUCHPOINT_TYPES.VISIT)).toBe(true);
      expect(isValidTouchpointNumber(4, TOUCHPOINT_TYPES.VISIT)).toBe(true);
      expect(isValidTouchpointNumber(7, TOUCHPOINT_TYPES.VISIT)).toBe(true);
    });

    it('should return false for invalid visit numbers', () => {
      expect(isValidTouchpointNumber(2, TOUCHPOINT_TYPES.VISIT)).toBe(false);
      expect(isValidTouchpointNumber(5, TOUCHPOINT_TYPES.VISIT)).toBe(false);
    });

    it('should return true for valid call numbers', () => {
      expect(isValidTouchpointNumber(2, TOUCHPOINT_TYPES.CALL)).toBe(true);
      expect(isValidTouchpointNumber(3, TOUCHPOINT_TYPES.CALL)).toBe(true);
      expect(isValidTouchpointNumber(5, TOUCHPOINT_TYPES.CALL)).toBe(true);
      expect(isValidTouchpointNumber(6, TOUCHPOINT_TYPES.CALL)).toBe(true);
    });

    it('should return false for invalid call numbers', () => {
      expect(isValidTouchpointNumber(1, TOUCHPOINT_TYPES.CALL)).toBe(false);
      expect(isValidTouchpointNumber(4, TOUCHPOINT_TYPES.CALL)).toBe(false);
    });
  });

  describe('canRoleCreateTouchpointType', () => {
    it('should return true for caravan with visit type', () => {
      expect(
        canRoleCreateTouchpointType(SYSTEM_ROLES.CARAVAN, TOUCHPOINT_TYPES.VISIT)
      ).toBe(true);
    });

    it('should return false for caravan with call type', () => {
      expect(
        canRoleCreateTouchpointType(SYSTEM_ROLES.CARAVAN, TOUCHPOINT_TYPES.CALL)
      ).toBe(false);
    });

    it('should return false for tele with visit type', () => {
      expect(
        canRoleCreateTouchpointType(SYSTEM_ROLES.TELE, TOUCHPOINT_TYPES.VISIT)
      ).toBe(false);
    });

    it('should return true for tele with call type', () => {
      expect(
        canRoleCreateTouchpointType(SYSTEM_ROLES.TELE, TOUCHPOINT_TYPES.CALL)
      ).toBe(true);
    });

    it('should return true for admin with any type', () => {
      expect(
        canRoleCreateTouchpointType(SYSTEM_ROLES.ADMIN, TOUCHPOINT_TYPES.VISIT)
      ).toBe(true);
      expect(
        canRoleCreateTouchpointType(SYSTEM_ROLES.ADMIN, TOUCHPOINT_TYPES.CALL)
      ).toBe(true);
    });

    it('should return true for area_manager with any type', () => {
      expect(
        canRoleCreateTouchpointType(SYSTEM_ROLES.AREA_MANAGER, TOUCHPOINT_TYPES.VISIT)
      ).toBe(true);
      expect(
        canRoleCreateTouchpointType(SYSTEM_ROLES.AREA_MANAGER, TOUCHPOINT_TYPES.CALL)
      ).toBe(true);
    });
  });
});
