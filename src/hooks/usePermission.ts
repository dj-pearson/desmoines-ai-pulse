/**
 * usePermission Hook
 *
 * Check if the current user has specific permissions.
 *
 * Usage:
 *
 * ```tsx
 * import { usePermission, PERMISSIONS } from '@/hooks/usePermission';
 *
 * function MyComponent() {
 *   const { hasPermission, isLoading } = usePermission();
 *
 *   if (isLoading) return <Spinner />;
 *
 *   if (hasPermission(PERMISSIONS.EVENTS_UPDATE_ANY)) {
 *     return <AdminEventEditor />;
 *   }
 *
 *   return <ReadOnlyView />;
 * }
 * ```
 */

import { useMemo, useCallback } from 'react';
import { useSecurityContext } from './useSecurityContext';
import {
  type Permission,
  type UserRole,
  hasPermission as checkHasPermission,
  hasAnyPermission as checkHasAnyPermission,
  hasAllPermissions as checkHasAllPermissions,
  hasMinimumRole as checkHasMinimumRole,
  isAdmin as checkIsAdmin,
  isRootAdmin as checkIsRootAdmin,
  isModerator as checkIsModerator,
  getHighestScope,
  PERMISSIONS,
} from '@/lib/security';

// Re-export PERMISSIONS for convenience
export { PERMISSIONS };

interface UsePermissionReturn {
  /** Check if user has a specific permission */
  hasPermission: (permission: Permission) => boolean;

  /** Check if user has any of the specified permissions */
  hasAnyPermission: (permissions: Permission[]) => boolean;

  /** Check if user has all of the specified permissions */
  hasAllPermissions: (permissions: Permission[]) => boolean;

  /** Check if user has at least the specified role */
  hasMinimumRole: (role: UserRole) => boolean;

  /** Check if user is admin */
  isAdmin: boolean;

  /** Check if user is root admin */
  isRootAdmin: boolean;

  /** Check if user is moderator or higher */
  isModerator: boolean;

  /** Get the highest scope for a resource/action combination */
  getScope: (resource: string, action: string) => 'any' | 'team' | 'own' | null;

  /** Current user's role */
  role: UserRole;

  /** Current user's role level */
  roleLevel: number;

  /** Whether permission data is still loading */
  isLoading: boolean;
}

export function usePermission(): UsePermissionReturn {
  const { context, isLoading } = useSecurityContext();

  const hasPermission = useCallback(
    (permission: Permission) => checkHasPermission(context, permission),
    [context]
  );

  const hasAnyPermission = useCallback(
    (permissions: Permission[]) => checkHasAnyPermission(context, permissions),
    [context]
  );

  const hasAllPermissions = useCallback(
    (permissions: Permission[]) => checkHasAllPermissions(context, permissions),
    [context]
  );

  const hasMinimumRole = useCallback(
    (role: UserRole) => checkHasMinimumRole(context, role),
    [context]
  );

  const getScope = useCallback(
    (resource: string, action: string) => getHighestScope(context, resource, action),
    [context]
  );

  return useMemo(() => ({
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasMinimumRole,
    isAdmin: checkIsAdmin(context),
    isRootAdmin: checkIsRootAdmin(context),
    isModerator: checkIsModerator(context),
    getScope,
    role: context.role,
    roleLevel: context.roleLevel,
    isLoading,
  }), [
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasMinimumRole,
    getScope,
    context,
    isLoading,
  ]);
}

/**
 * Hook to check a specific permission
 * Simpler API when you only need to check one permission
 *
 * ```tsx
 * const canEdit = useHasPermission(PERMISSIONS.EVENTS_UPDATE_OWN);
 * ```
 */
export function useHasPermission(permission: Permission): boolean {
  const { hasPermission, isLoading } = usePermission();
  return !isLoading && hasPermission(permission);
}

/**
 * Hook to check if user has any of the permissions
 *
 * ```tsx
 * const canManageEvents = useHasAnyPermission([
 *   PERMISSIONS.EVENTS_UPDATE_OWN,
 *   PERMISSIONS.EVENTS_UPDATE_ANY,
 * ]);
 * ```
 */
export function useHasAnyPermission(permissions: Permission[]): boolean {
  const { hasAnyPermission, isLoading } = usePermission();
  return !isLoading && hasAnyPermission(permissions);
}

/**
 * Hook to check if user has minimum role
 *
 * ```tsx
 * const canModerate = useHasMinimumRole('moderator');
 * ```
 */
export function useHasMinimumRole(role: UserRole): boolean {
  const { hasMinimumRole, isLoading } = usePermission();
  return !isLoading && hasMinimumRole(role);
}
