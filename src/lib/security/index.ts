/**
 * Security Module
 *
 * Defense-in-depth security with 4 layers:
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Layer 1: Authentication (WHO are you?)                 │
 * │  - requireAuth, buildSecurityContext                    │
 * │  - Validates JWT/session is valid                       │
 * ├─────────────────────────────────────────────────────────┤
 * │  Layer 2: Authorization (WHAT can you do?)              │
 * │  - requirePermission('events.update.own')               │
 * │  - Role level checks (roleLevel >= 5)                   │
 * ├─────────────────────────────────────────────────────────┤
 * │  Layer 3: Resource Ownership (IS this yours?)           │
 * │  - Owner checks (createdBy = userId for "own" access)   │
 * │  - Team access (campaign team members)                  │
 * ├─────────────────────────────────────────────────────────┤
 * │  Layer 4: Database RLS (FINAL enforcement)              │
 * │  - Row-level security policies in PostgreSQL            │
 * │  - Even if code has bugs, DB rejects unauthorized       │
 * └─────────────────────────────────────────────────────────┘
 *
 * Usage:
 *
 * ```typescript
 * import {
 *   securityCheck,
 *   requireAuth,
 *   requirePermission,
 *   requireOwnership,
 *   PERMISSIONS,
 * } from '@/lib/security';
 *
 * // Simple auth check
 * const authResult = await requireAuth();
 * if (!authResult.allowed) {
 *   // Handle unauthorized
 * }
 *
 * // Permission check
 * const permResult = await requirePermission(PERMISSIONS.EVENTS_UPDATE_OWN);
 *
 * // Ownership check with permission
 * const ownerResult = await requireOwnership(
 *   'event',
 *   eventId,
 *   PERMISSIONS.EVENTS_UPDATE_OWN
 * );
 *
 * // Full security check
 * const result = await securityCheck(null, {
 *   permission: PERMISSIONS.EVENTS_UPDATE_OWN,
 *   ownership: { resourceType: 'event', resourceId: eventId },
 *   auditOnDenial: 'permission_denied',
 * });
 * ```
 */

// Types (type-only exports)
export type {
  UserRole,
  Permission,
  PermissionScope,
  PermissionAction,
  SecurityContext,
  SecurityCheckResult,
  SecurityLayer,
  SecurityErrorCode,
  OwnableResource,
  OwnershipConfig,
  SecurityEventType,
  SecurityAuditEntry,
} from './types';

// Values from types
export {
  ROLE_LEVELS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  OWNERSHIP_COLUMNS,
  getRoleLevel,
  createAnonymousContext,
} from './types';

// Permission checking (Layer 2)
export {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  meetsRoleLevel,
  hasMinimumRole,
  isAdmin,
  isRootAdmin,
  isModerator,
  checkPermission,
  checkRoleLevel,
  getPermissionsForRole,
  permissionCoversScope,
  getHighestScope,
} from './permissions';

// Ownership checking (Layer 3)
export {
  isResourceOwner,
  checkOwnership,
  applyTenantFilter,
  applyOwnerFilter,
  validateResourceAccess,
  quickOwnershipCheck,
  buildOwnershipFilter,
} from './ownership';

// Middleware (All layers)
export {
  buildSecurityContext,
  securityCheck,
  requireAuth,
  requirePermission,
  requireAnyPermission,
  requireRole,
  requireAdmin,
  requireOwnership,
  canPerformAction,
  getSecurityContext,
  clearSecurityContextCache,
  logSecurityEvent,
  createSyncPermissionCheck,
  createSyncAdminCheck,
  type SecurityCheckOptions,
} from './middleware';
