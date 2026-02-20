/**
 * Security Middleware
 *
 * Unified middleware that enforces all 4 security layers:
 * 1. Authentication - WHO are you?
 * 2. Authorization - WHAT can you do?
 * 3. Resource Ownership - IS this yours?
 * 4. Database RLS - FINAL enforcement
 *
 * Use this middleware to protect operations in a consistent way.
 */

import {
  type SecurityContext,
  type SecurityCheckResult,
  type Permission,
  type OwnableResource,
  type OwnershipConfig,
  type SecurityAuditEntry,
  type SecurityEventType,
  createAnonymousContext,
  getRoleLevel,
  ROLE_LEVELS,
  type UserRole,
} from './types';
import {
  hasPermission,
  hasAnyPermission,
  checkPermission,
  checkRoleLevel,
  isAdmin,
  getPermissionsForRole,
} from './permissions';
import { checkOwnership, validateResourceAccess } from './ownership';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const logger = createLogger('SecurityMiddleware');

// =============================================================================
// SECURITY CONTEXT BUILDER
// =============================================================================

/**
 * Build a security context from the current Supabase session
 *
 * @returns Promise resolving to the security context
 */
export async function buildSecurityContext(): Promise<SecurityContext> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return createAnonymousContext();
    }

    const user = session.user;
    const role = await getUserRole(user.id);
    const permissions = getPermissionsForRole(role);

    return {
      isAuthenticated: true,
      userId: user.id,
      email: user.email || null,
      role,
      roleLevel: getRoleLevel(role),
      permissions,
      sessionId: session.access_token?.slice(-8), // Last 8 chars for logging
    };
  } catch (error) {
    logger.error('buildSecurityContext', 'Error building security context', { error: String(error) });
    return createAnonymousContext();
  }
}

/**
 * Get user's role from the database
 */
async function getUserRole(userId: string): Promise<UserRole> {
  try {
    // First check user_roles table (new standard)
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['root_admin', 'admin', 'moderator'])
      .order('role')
      .limit(1)
      .maybeSingle();

    if (roleData?.role) {
      return roleData.role as UserRole;
    }

    // Fallback to profiles.user_role (legacy)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', userId)
      .single();

    if (profileData?.user_role) {
      return profileData.user_role as UserRole;
    }

    return 'user';
  } catch (error) {
    logger.error('getUserRole', 'Error fetching user role', { error: String(error) });
    return 'user';
  }
}

// =============================================================================
// UNIFIED SECURITY CHECK
// =============================================================================

export interface SecurityCheckOptions {
  /** Required permission (Layer 2) */
  permission?: Permission;

  /** Alternative permissions (any of these) */
  anyPermission?: Permission[];

  /** Minimum role level (Layer 2) */
  minRoleLevel?: number;

  /** Minimum role (Layer 2) */
  minRole?: UserRole;

  /** Resource ownership check (Layer 3) */
  ownership?: {
    resourceType: OwnableResource;
    resourceId: string;
    config?: Partial<OwnershipConfig>;
  };

  /** Audit event to log on denial */
  auditOnDenial?: SecurityEventType;

  /** Additional metadata for audit */
  auditMetadata?: Record<string, unknown>;
}

/**
 * Perform a comprehensive security check across all layers
 *
 * @param context - Security context (or null to build one)
 * @param options - Security check options
 * @returns Promise resolving to security check result
 */
export async function securityCheck(
  context: SecurityContext | null,
  options: SecurityCheckOptions
): Promise<SecurityCheckResult> {
  // Build context if not provided
  const securityContext = context || await buildSecurityContext();

  // =========================================================================
  // LAYER 1: Authentication
  // =========================================================================
  if (!securityContext.isAuthenticated) {
    const result: SecurityCheckResult = {
      allowed: false,
      errorCode: 'UNAUTHENTICATED',
      reason: 'Authentication required',
      deniedByLayer: 'authentication',
    };

    if (options.auditOnDenial) {
      await logSecurityEvent({
        eventType: options.auditOnDenial,
        metadata: { ...options.auditMetadata, reason: result.reason },
      });
    }

    return result;
  }

  // =========================================================================
  // LAYER 2: Authorization (Permission Check)
  // =========================================================================
  if (options.permission) {
    const permCheck = checkPermission(securityContext, options.permission);
    if (!permCheck.allowed) {
      if (options.auditOnDenial) {
        await logSecurityEvent({
          eventType: options.auditOnDenial,
          userId: securityContext.userId || undefined,
          metadata: {
            ...options.auditMetadata,
            permission: options.permission,
            reason: permCheck.reason,
          },
        });
      }
      return permCheck;
    }
  }

  if (options.anyPermission && options.anyPermission.length > 0) {
    if (!hasAnyPermission(securityContext, options.anyPermission)) {
      const result: SecurityCheckResult = {
        allowed: false,
        errorCode: 'PERMISSION_DENIED',
        reason: `Missing required permissions: ${options.anyPermission.join(' or ')}`,
        deniedByLayer: 'authorization',
      };

      if (options.auditOnDenial) {
        await logSecurityEvent({
          eventType: options.auditOnDenial,
          userId: securityContext.userId || undefined,
          metadata: {
            ...options.auditMetadata,
            requiredPermissions: options.anyPermission,
            reason: result.reason,
          },
        });
      }

      return result;
    }
  }

  // =========================================================================
  // LAYER 2: Authorization (Role Level Check)
  // =========================================================================
  if (options.minRoleLevel !== undefined) {
    const roleCheck = checkRoleLevel(securityContext, options.minRoleLevel);
    if (!roleCheck.allowed) {
      if (options.auditOnDenial) {
        await logSecurityEvent({
          eventType: options.auditOnDenial,
          userId: securityContext.userId || undefined,
          metadata: {
            ...options.auditMetadata,
            requiredLevel: options.minRoleLevel,
            userLevel: securityContext.roleLevel,
            reason: roleCheck.reason,
          },
        });
      }
      return roleCheck;
    }
  }

  if (options.minRole) {
    const requiredLevel = ROLE_LEVELS[options.minRole];
    const roleCheck = checkRoleLevel(securityContext, requiredLevel);
    if (!roleCheck.allowed) {
      if (options.auditOnDenial) {
        await logSecurityEvent({
          eventType: options.auditOnDenial,
          userId: securityContext.userId || undefined,
          metadata: {
            ...options.auditMetadata,
            requiredRole: options.minRole,
            userRole: securityContext.role,
            reason: roleCheck.reason,
          },
        });
      }
      return roleCheck;
    }
  }

  // =========================================================================
  // LAYER 3: Resource Ownership
  // =========================================================================
  if (options.ownership) {
    const { resourceType, resourceId, config } = options.ownership;
    const ownershipCheck = await checkOwnership(
      securityContext,
      resourceType,
      resourceId,
      config
    );

    if (!ownershipCheck.allowed) {
      if (options.auditOnDenial) {
        await logSecurityEvent({
          eventType: options.auditOnDenial,
          userId: securityContext.userId || undefined,
          resourceType,
          resourceId,
          metadata: {
            ...options.auditMetadata,
            reason: ownershipCheck.reason,
          },
        });
      }
      return ownershipCheck;
    }
  }

  // =========================================================================
  // LAYER 4: Database RLS
  // (Handled automatically by Supabase on actual queries)
  // =========================================================================

  return { allowed: true };
}

// =============================================================================
// CONVENIENCE MIDDLEWARE FUNCTIONS
// =============================================================================

/**
 * Require authentication only
 * Layer 1 check
 */
export async function requireAuth(
  context?: SecurityContext | null
): Promise<SecurityCheckResult> {
  return securityCheck(context || null, {
    auditOnDenial: 'permission_denied',
  });
}

/**
 * Require a specific permission
 * Layers 1 + 2
 */
export async function requirePermission(
  permission: Permission,
  context?: SecurityContext | null
): Promise<SecurityCheckResult> {
  return securityCheck(context || null, {
    permission,
    auditOnDenial: 'permission_denied',
  });
}

/**
 * Require any of the specified permissions
 * Layers 1 + 2
 */
export async function requireAnyPermission(
  permissions: Permission[],
  context?: SecurityContext | null
): Promise<SecurityCheckResult> {
  return securityCheck(context || null, {
    anyPermission: permissions,
    auditOnDenial: 'permission_denied',
  });
}

/**
 * Require a minimum role
 * Layers 1 + 2
 */
export async function requireRole(
  minRole: UserRole,
  context?: SecurityContext | null
): Promise<SecurityCheckResult> {
  return securityCheck(context || null, {
    minRole,
    auditOnDenial: 'permission_denied',
  });
}

/**
 * Require admin role
 * Layers 1 + 2
 */
export async function requireAdmin(
  context?: SecurityContext | null
): Promise<SecurityCheckResult> {
  return requireRole('admin', context);
}

/**
 * Require resource ownership
 * Layers 1 + 2 + 3
 */
export async function requireOwnership(
  resourceType: OwnableResource,
  resourceId: string,
  permission?: Permission,
  context?: SecurityContext | null
): Promise<SecurityCheckResult> {
  return securityCheck(context || null, {
    permission,
    ownership: { resourceType, resourceId },
    auditOnDenial: 'ownership_denied',
  });
}

// =============================================================================
// SECURITY HELPERS
// =============================================================================

/**
 * Check if current user can perform an action on a resource
 *
 * @param resourceType - Type of resource
 * @param resourceId - ID of the resource (for ownership check)
 * @param action - Action to perform ('view', 'create', 'update', 'delete')
 * @param context - Optional security context
 */
export async function canPerformAction(
  resourceType: OwnableResource,
  resourceId: string | null,
  action: 'view' | 'create' | 'update' | 'delete',
  context?: SecurityContext | null
): Promise<boolean> {
  const securityContext = context || await buildSecurityContext();

  if (!securityContext.isAuthenticated) {
    // Anonymous users can only view public content
    return action === 'view';
  }

  // Check 'any' permission first (admin)
  const anyPermission = `${resourceType}s.${action}.any`;
  if (hasPermission(securityContext, anyPermission)) {
    return true;
  }

  // Check 'own' permission
  const ownPermission = `${resourceType}s.${action}.own`;
  if (hasPermission(securityContext, ownPermission)) {
    // For 'create', ownership doesn't apply
    if (action === 'create') {
      return true;
    }

    // For other actions, check ownership
    if (resourceId) {
      const ownershipCheck = await checkOwnership(
        securityContext,
        resourceType,
        resourceId,
        { adminBypass: false }
      );
      return ownershipCheck.allowed;
    }
  }

  return false;
}

/**
 * Get the security context with caching
 * Useful for components that need the context multiple times
 */
let cachedContext: SecurityContext | null = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

export async function getSecurityContext(forceRefresh = false): Promise<SecurityContext> {
  const now = Date.now();

  if (!forceRefresh && cachedContext && (now - cacheTime) < CACHE_TTL) {
    return cachedContext;
  }

  cachedContext = await buildSecurityContext();
  cacheTime = now;

  return cachedContext;
}

/**
 * Clear the cached security context
 * Call this on logout or role changes
 */
export function clearSecurityContextCache(): void {
  cachedContext = null;
  cacheTime = 0;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Log a security event for audit purposes
 */
export async function logSecurityEvent(entry: SecurityAuditEntry): Promise<void> {
  try {
    // Use the security_audit_logs table if it exists
    // This is a fire-and-forget operation
    await supabase.from('security_audit_logs').insert({
      event_type: entry.eventType,
      user_id: entry.userId,
      ip_address: entry.ipAddress,
      user_agent: entry.userAgent,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      metadata: entry.metadata,
      created_at: entry.timestamp?.toISOString() || new Date().toISOString(),
    });
  } catch (error) {
    // Don't fail the operation if audit logging fails
    logger.error('logSecurityEvent', 'Failed to log security event', { error: String(error) });
  }
}

// =============================================================================
// REACT INTEGRATION HELPERS
// =============================================================================

/**
 * Create a security check function for use in React components
 * Returns a synchronous check using cached permissions
 */
export function createSyncPermissionCheck(
  context: SecurityContext
): (permission: Permission) => boolean {
  return (permission: Permission) => hasPermission(context, permission);
}

/**
 * Create an admin check function for use in React components
 */
export function createSyncAdminCheck(
  context: SecurityContext
): () => boolean {
  return () => isAdmin(context);
}
