/**
 * Permission Checking Utilities
 *
 * Layer 2: Authorization - WHAT can you do?
 *
 * Provides functions to check if a user has specific permissions
 * based on their role and the role-permission mapping.
 */

import {
  type UserRole,
  type Permission,
  type SecurityContext,
  type SecurityCheckResult,
  ROLE_LEVELS,
  ROLE_PERMISSIONS,
  getRoleLevel,
} from './types';

// =============================================================================
// PERMISSION CHECKING
// =============================================================================

/**
 * Get all permissions for a role (including inherited permissions)
 * Roles inherit permissions from lower-level roles
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  const roleLevel = ROLE_LEVELS[role];
  const allPermissions = new Set<Permission>();

  // Add permissions from this role and all lower roles
  for (const [r, level] of Object.entries(ROLE_LEVELS)) {
    if (level <= roleLevel) {
      const rolePerms = ROLE_PERMISSIONS[r as UserRole] || [];
      rolePerms.forEach(p => allPermissions.add(p));
    }
  }

  return Array.from(allPermissions);
}

/**
 * Check if a user has a specific permission
 *
 * @param context - Security context with user role/permissions
 * @param permission - Permission to check
 * @returns Whether the user has the permission
 */
export function hasPermission(
  context: SecurityContext | { role: UserRole } | undefined,
  permission: Permission
): boolean {
  if (!context) return false;

  const role = context.role || 'user';

  // Get all permissions for the user's role (including inherited)
  const permissions = getPermissionsForRole(role);

  // Check for exact permission match
  if (permissions.includes(permission)) {
    return true;
  }

  // Check for wildcard permissions
  // e.g., 'events.*.any' matches 'events.view.any', 'events.create.any', etc.
  const [resource, action, scope] = permission.split('.');
  const wildcardPatterns = [
    `${resource}.*.${scope}`, // e.g., events.*.any
    `${resource}.${action}.*`, // e.g., events.view.*
    `${resource}.*.*`, // e.g., events.*.*
    `*.${action}.${scope}`, // e.g., *.view.any
    `*.*.*`, // Full wildcard (superadmin)
  ];

  return wildcardPatterns.some(pattern => permissions.includes(pattern));
}

/**
 * Check if a user has any of the specified permissions
 *
 * @param context - Security context with user role/permissions
 * @param permissions - Array of permissions to check
 * @returns Whether the user has any of the permissions
 */
export function hasAnyPermission(
  context: SecurityContext | { role: UserRole } | undefined,
  permissions: Permission[]
): boolean {
  return permissions.some(p => hasPermission(context, p));
}

/**
 * Check if a user has all of the specified permissions
 *
 * @param context - Security context with user role/permissions
 * @param permissions - Array of permissions to check
 * @returns Whether the user has all of the permissions
 */
export function hasAllPermissions(
  context: SecurityContext | { role: UserRole } | undefined,
  permissions: Permission[]
): boolean {
  return permissions.every(p => hasPermission(context, p));
}

// =============================================================================
// ROLE LEVEL CHECKING
// =============================================================================

/**
 * Check if a user's role level meets the minimum requirement
 *
 * @param context - Security context with user role
 * @param minLevel - Minimum role level required
 * @returns Whether the user meets the minimum level
 */
export function meetsRoleLevel(
  context: SecurityContext | { role: UserRole } | undefined,
  minLevel: number
): boolean {
  if (!context) return false;
  const userLevel = getRoleLevel(context.role);
  return userLevel >= minLevel;
}

/**
 * Check if a user has at least a specific role
 *
 * @param context - Security context with user role
 * @param minRole - Minimum role required
 * @returns Whether the user has at least the specified role
 */
export function hasMinimumRole(
  context: SecurityContext | { role: UserRole } | undefined,
  minRole: UserRole
): boolean {
  return meetsRoleLevel(context, ROLE_LEVELS[minRole]);
}

/**
 * Check if a user is an admin (admin or root_admin)
 */
export function isAdmin(
  context: SecurityContext | { role: UserRole } | undefined
): boolean {
  return hasMinimumRole(context, 'admin');
}

/**
 * Check if a user is a root admin
 */
export function isRootAdmin(
  context: SecurityContext | { role: UserRole } | undefined
): boolean {
  return context?.role === 'root_admin';
}

/**
 * Check if a user is at least a moderator
 */
export function isModerator(
  context: SecurityContext | { role: UserRole } | undefined
): boolean {
  return hasMinimumRole(context, 'moderator');
}

// =============================================================================
// PERMISSION CHECK WITH RESULT
// =============================================================================

/**
 * Check a permission and return a detailed result
 *
 * @param context - Security context
 * @param permission - Permission to check
 * @returns Detailed result of the permission check
 */
export function checkPermission(
  context: SecurityContext | undefined,
  permission: Permission
): SecurityCheckResult {
  if (!context?.isAuthenticated) {
    return {
      allowed: false,
      errorCode: 'UNAUTHENTICATED',
      reason: 'User must be authenticated to perform this action',
      deniedByLayer: 'authentication',
    };
  }

  if (!hasPermission(context, permission)) {
    return {
      allowed: false,
      errorCode: 'PERMISSION_DENIED',
      reason: `Missing required permission: ${permission}`,
      deniedByLayer: 'authorization',
    };
  }

  return { allowed: true };
}

/**
 * Check role level and return a detailed result
 *
 * @param context - Security context
 * @param minLevel - Minimum role level required
 * @returns Detailed result of the role check
 */
export function checkRoleLevel(
  context: SecurityContext | undefined,
  minLevel: number
): SecurityCheckResult {
  if (!context?.isAuthenticated) {
    return {
      allowed: false,
      errorCode: 'UNAUTHENTICATED',
      reason: 'User must be authenticated to perform this action',
      deniedByLayer: 'authentication',
    };
  }

  if (!meetsRoleLevel(context, minLevel)) {
    return {
      allowed: false,
      errorCode: 'INSUFFICIENT_ROLE',
      reason: `Insufficient role level. Required: ${minLevel}, Current: ${context.roleLevel}`,
      deniedByLayer: 'authorization',
    };
  }

  return { allowed: true };
}

// =============================================================================
// SCOPE CHECKING
// =============================================================================

/**
 * Check if a permission allows access to a specific scope
 *
 * @param permission - Permission string (e.g., 'events.update.own')
 * @param requiredScope - Required scope ('own', 'team', 'any')
 * @returns Whether the permission covers the required scope
 */
export function permissionCoversScope(
  permission: Permission,
  requiredScope: 'own' | 'team' | 'any'
): boolean {
  const parts = permission.split('.');
  const permScope = parts[2];

  if (!permScope) return false;

  // 'any' scope covers all scopes
  if (permScope === 'any') return true;

  // 'team' scope covers 'own'
  if (permScope === 'team' && requiredScope === 'own') return true;

  // Exact match
  return permScope === requiredScope;
}

/**
 * Get the highest scope a user has for a given resource and action
 *
 * @param context - Security context
 * @param resource - Resource name (e.g., 'events')
 * @param action - Action name (e.g., 'update')
 * @returns Highest scope ('any' > 'team' > 'own' > null)
 */
export function getHighestScope(
  context: SecurityContext | { role: UserRole } | undefined,
  resource: string,
  action: string
): 'any' | 'team' | 'own' | null {
  if (!context) return null;

  const scopes: ('any' | 'team' | 'own')[] = ['any', 'team', 'own'];

  for (const scope of scopes) {
    const permission = `${resource}.${action}.${scope}`;
    if (hasPermission(context, permission)) {
      return scope;
    }
  }

  return null;
}
