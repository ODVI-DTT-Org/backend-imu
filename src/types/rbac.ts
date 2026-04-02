/**
 * RBAC System Type Definitions
 *
 * This file contains all TypeScript interfaces and types for the Role-Based Access Control system.
 * These types ensure type safety when working with roles, permissions, and user assignments.
 *
 * @file rbac.ts
 * @module types/rbac
 */

// ============================================
// DATABASE ROW TYPES
// ============================================

/**
 * Role database row
 */
export interface RoleRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  level: number;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Permission database row
 */
export interface PermissionRow {
  id: string;
  resource: string;
  action: string;
  description: string | null;
  constraint_name: string | null;
  created_at: Date;
}

/**
 * Role permission junction table row
 */
export interface RolePermissionRow {
  id: string;
  role_id: string;
  permission_id: string;
  granted_at: Date;
  granted_by: string | null;
}

/**
 * User role junction table row
 */
export interface UserRoleRow {
  id: string;
  user_id: string;
  role_id: string;
  assigned_at: Date;
  assigned_by: string | null;
  expires_at: Date | null;
  is_active: boolean;
}

// ============================================
// VIEW TYPES
// ============================================

/**
 * User permission view row
 */
export interface UserPermissionView {
  user_id: string;
  role_slug: string;
  role_name: string;
  resource: string;
  action: string;
  constraint_name: string | null;
  role_level: number;
}

// ============================================
// API TYPES
// ============================================

/**
 * Permission object returned by API
 */
export interface Permission {
  resource: string;
  action: string;
  constraint_name?: string;
  role_slug: string;
}

/**
 * Role details with permissions
 */
export interface RoleWithPermissions extends Omit<RoleRow, 'id' | 'created_at' | 'updated_at'> {
  permissions: Array<{
    resource: string;
    action: string;
    constraint_name?: string;
  }>;
}

/**
 * User role assignment details
 */
export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  role_name: string;
  role_slug: string;
  assigned_at: Date;
  assigned_by: string | null;
  expires_at: Date | null;
  is_active: boolean;
}

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request body for creating a role
 */
export interface CreateRoleRequest {
  name: string;
  slug?: string;
  description?: string;
  level?: number;
  is_system?: boolean;
}

/**
 * Request body for updating a role
 */
export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  level?: number;
}

/**
 * Request body for creating a permission
 */
export interface CreatePermissionRequest {
  resource: string;
  action: string;
  description?: string;
  constraint_name?: string;
}

/**
 * Request body for assigning permission to role
 */
export interface AssignPermissionRequest {
  role_id: string;
  permission_id: string;
}

/**
 * Request body for assigning role to user
 */
export interface AssignRoleRequest {
  user_id: string;
  role_id: string;
  expires_at?: string; // ISO date string
}

/**
 * Request body for bulk permission check
 */
export interface CheckPermissionsRequest {
  permissions: Array<{
    resource: string;
    action: string;
    constraint_name?: string;
  }>;
}

/**
 * Response for permission check
 */
export interface CheckPermissionsResponse {
  has_permission: boolean;
  permissions: Array<{
    resource: string;
    action: string;
    constraint_name?: string;
    granted: boolean;
  }>;
}

// ============================================
// MIDDLEWARE TYPES
// ============================================

/**
 * Permission requirement for middleware
 */
export interface PermissionRequirement {
  resource: string;
  action: string;
  constraint?: string;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  granted: boolean;
  missing_permissions?: PermissionRequirement[];
}

// ============================================
// ENUMS AND CONSTANTS
// ============================================

/**
 * System role slugs
 */
export const SYSTEM_ROLES = {
  ADMIN: 'admin',
  AREA_MANAGER: 'area_manager',
  ASSISTANT_AREA_MANAGER: 'assistant_area_manager',
  CARAVAN: 'caravan',
  TELE: 'tele',
} as const;

export type SystemRoleSlug = typeof SYSTEM_ROLES[keyof typeof SYSTEM_ROLES];

/**
 * Permission resources
 */
export const PERMISSION_RESOURCES = {
  USERS: 'users',
  CLIENTS: 'clients',
  TOUCHPOINTS: 'touchpoints',
  ITINERARIES: 'itineraries',
  REPORTS: 'reports',
  AGENCIES: 'agencies',
  GROUPS: 'groups',
  TARGETS: 'targets',
  ATTENDANCE: 'attendance',
  AUDIT_LOGS: 'audit_logs',
  SYSTEM: 'system',
} as const;

export type PermissionResource = typeof PERMISSION_RESOURCES[keyof typeof PERMISSION_RESOURCES];

/**
 * Permission actions
 */
export const PERMISSION_ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  ASSIGN: 'assign',
  MANAGE_MEMBERS: 'manage_members',
  SET: 'set',
  CONFIGURE: 'configure',
} as const;

export type PermissionAction = typeof PERMISSION_ACTIONS[keyof typeof PERMISSION_ACTIONS];

/**
 * Permission constraints
 */
export const PERMISSION_CONSTRAINTS = {
  OWN: 'own',
  AREA: 'area',
  ALL: 'all',
  VISIT: 'visit',
  CALL: 'call',
  ASSIGNED: 'assigned',
} as const;

export type PermissionConstraint = typeof PERMISSION_CONSTRAINTS[keyof typeof PERMISSION_CONSTRAINTS] | null;

/**
 * Touchpoint types
 */
export const TOUCHPOINT_TYPES = {
  VISIT: 'Visit',
  CALL: 'Call',
} as const;

export type TouchpointType = typeof TOUCHPOINT_TYPES[keyof typeof TOUCHPOINT_TYPES];

/**
 * Touchpoint numbers by type
 */
export const TOUCHPOINT_NUMBERS = {
  VISIT: [1, 4, 7],
  CALL: [2, 3, 5, 6],
} as const;

// ============================================
// HELPER TYPES
// ============================================

/**
 * User permissions grouped by resource
 */
export type GroupedUserPermissions = Record<
  string,
  Array<{
    action: string;
    constraint?: string;
  }>
>;

/**
 * Role permission matrix
 */
export interface RolePermissionMatrix {
  [roleSlug: string]: {
    [resource: string]: {
      [action: string]: PermissionConstraint | true;
    };
  };
}

/**
 * Permission error details
 */
export interface PermissionError {
  message: string;
  required?: PermissionRequirement;
  user_permissions?: Permission[];
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if a value is a valid system role slug
 */
export function isSystemRoleSlug(value: string): value is SystemRoleSlug {
  return Object.values(SYSTEM_ROLES).includes(value as SystemRoleSlug);
}

/**
 * Check if a value is a valid permission resource
 */
export function isPermissionResource(value: string): value is PermissionResource {
  return Object.values(PERMISSION_RESOURCES).includes(value as PermissionResource);
}

/**
 * Check if a value is a valid permission action
 */
export function isPermissionAction(value: string): value is PermissionAction {
  return Object.values(PERMISSION_ACTIONS).includes(value as PermissionAction);
}

/**
 * Check if touchpoint number is valid for type
 */
export function isValidTouchpointNumber(number: number, type: TouchpointType): boolean {
  if (type === TOUCHPOINT_TYPES.VISIT) {
    return TOUCHPOINT_NUMBERS.VISIT.includes(number as 1 | 4 | 7);
  } else if (type === TOUCHPOINT_TYPES.CALL) {
    return TOUCHPOINT_NUMBERS.CALL.includes(number as 2 | 3 | 5 | 6);
  }
  return false;
}

/**
 * Check if user role can create touchpoint type
 */
export function canRoleCreateTouchpointType(roleSlug: string, touchpointType: TouchpointType): boolean {
  if (roleSlug === SYSTEM_ROLES.CARAVAN) {
    return touchpointType === TOUCHPOINT_TYPES.VISIT;
  } else if (roleSlug === SYSTEM_ROLES.TELE) {
    return touchpointType === TOUCHPOINT_TYPES.CALL;
  } else if ([SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.AREA_MANAGER, SYSTEM_ROLES.ASSISTANT_AREA_MANAGER].includes(roleSlug as any)) {
    return true; // Managers can create both
  }
  return false;
}

// ============================================
// DATABASE QUERY RESULT TYPES
// ============================================

/**
 * Result of has_permission database function
 */
export interface HasPermissionResult {
  has_permission: boolean;
}

/**
 * Result of get_user_permissions database function
 */
export interface GetUserPermissionsResult {
  resource: string;
  action: string;
  constraint_name: string | null;
  role_slug: string;
}

/**
 * Result of has_role database function
 */
export interface HasRoleResult {
  has_role: boolean;
}
