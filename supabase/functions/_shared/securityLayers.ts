/**
 * Security Layers Middleware for Edge Functions
 *
 * Implements defense-in-depth security:
 * Layer 1: Authentication (JWT validation)
 * Layer 2: Authorization (permissions/roles)
 * Layer 3: Resource Ownership (owner checks)
 * Layer 4: Database RLS (automatic via Supabase)
 */

import { createClient, SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================================
// TYPES
// =============================================================================

export type UserRole = 'user' | 'moderator' | 'admin' | 'root_admin';

export interface SecurityContext {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  role: UserRole;
  roleLevel: number;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SecurityCheckResult {
  allowed: boolean;
  errorCode?: string;
  reason?: string;
  deniedByLayer?: 'authentication' | 'authorization' | 'ownership' | 'rls';
}

export const ROLE_LEVELS: Record<UserRole, number> = {
  user: 1,
  moderator: 5,
  admin: 10,
  root_admin: 100,
};

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

/**
 * Build security context from request
 */
export async function buildSecurityContext(
  req: Request,
  supabaseClient: SupabaseClient
): Promise<SecurityContext> {
  const authHeader = req.headers.get('Authorization');
  const ipAddress = req.headers.get('CF-Connecting-IP') ||
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    null;
  const userAgent = req.headers.get('User-Agent');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      isAuthenticated: false,
      userId: null,
      email: null,
      role: 'user',
      roleLevel: 0,
      ipAddress,
      userAgent,
    };
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
      return {
        isAuthenticated: false,
        userId: null,
        email: null,
        role: 'user',
        roleLevel: 0,
        ipAddress,
        userAgent,
      };
    }

    // Fetch user's role
    const role = await getUserRole(supabaseClient, user.id);

    return {
      isAuthenticated: true,
      userId: user.id,
      email: user.email || null,
      role,
      roleLevel: ROLE_LEVELS[role],
      ipAddress,
      userAgent,
    };
  } catch (error) {
    console.error('Error building security context:', error);
    return {
      isAuthenticated: false,
      userId: null,
      email: null,
      role: 'user',
      roleLevel: 0,
      ipAddress,
      userAgent,
    };
  }
}

/**
 * Get user's role from database
 */
async function getUserRole(
  supabaseClient: SupabaseClient,
  userId: string
): Promise<UserRole> {
  try {
    // Check user_roles table
    const { data: roleData } = await supabaseClient
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

    // Fallback to profiles
    const { data: profileData } = await supabaseClient
      .from('profiles')
      .select('user_role')
      .eq('id', userId)
      .single();

    if (profileData?.user_role) {
      return profileData.user_role as UserRole;
    }

    return 'user';
  } catch {
    return 'user';
  }
}

// =============================================================================
// SECURITY CHECKS
// =============================================================================

/**
 * Check if user has a permission
 */
export async function hasPermission(
  supabaseClient: SupabaseClient,
  userId: string,
  permission: string
): Promise<boolean> {
  try {
    const { data, error } = await supabaseClient
      .rpc('user_has_permission', {
        p_user_id: userId,
        p_permission_id: permission,
      });

    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * Check if user meets minimum role level
 */
export function meetsRoleLevel(context: SecurityContext, minLevel: number): boolean {
  return context.roleLevel >= minLevel;
}

/**
 * Check if user has minimum role
 */
export function hasMinimumRole(context: SecurityContext, minRole: UserRole): boolean {
  return meetsRoleLevel(context, ROLE_LEVELS[minRole]);
}

/**
 * Check if user is admin
 */
export function isAdmin(context: SecurityContext): boolean {
  return hasMinimumRole(context, 'admin');
}

/**
 * Check resource ownership
 */
export async function isResourceOwner(
  supabaseClient: SupabaseClient,
  userId: string,
  tableName: string,
  resourceId: string,
  ownerColumn = 'user_id'
): Promise<boolean> {
  try {
    const { data, error } = await supabaseClient
      .rpc('user_owns_resource', {
        p_user_id: userId,
        p_table_name: tableName,
        p_resource_id: resourceId,
        p_owner_column: ownerColumn,
      });

    return !error && data === true;
  } catch {
    return false;
  }
}

// =============================================================================
// MIDDLEWARE FUNCTIONS
// =============================================================================

export interface SecurityMiddlewareOptions {
  /** Require authentication */
  requireAuth?: boolean;
  /** Required permission */
  permission?: string;
  /** Minimum role required */
  minRole?: UserRole;
  /** Minimum role level required */
  minRoleLevel?: number;
  /** Resource ownership check */
  ownership?: {
    tableName: string;
    resourceId: string;
    ownerColumn?: string;
    adminBypass?: boolean;
  };
}

/**
 * Main security middleware
 */
export async function securityMiddleware(
  req: Request,
  supabaseClient: SupabaseClient,
  options: SecurityMiddlewareOptions
): Promise<{ context: SecurityContext; result: SecurityCheckResult }> {
  const context = await buildSecurityContext(req, supabaseClient);

  // Layer 1: Authentication
  if (options.requireAuth !== false && !context.isAuthenticated) {
    return {
      context,
      result: {
        allowed: false,
        errorCode: 'UNAUTHENTICATED',
        reason: 'Authentication required',
        deniedByLayer: 'authentication',
      },
    };
  }

  // Layer 2: Role Level Check
  if (options.minRoleLevel !== undefined) {
    if (!meetsRoleLevel(context, options.minRoleLevel)) {
      await logSecurityEvent(supabaseClient, {
        eventType: 'permission_denied',
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        securityLayer: 'authorization',
        errorCode: 'INSUFFICIENT_ROLE',
        metadata: { requiredLevel: options.minRoleLevel, userLevel: context.roleLevel },
      });

      return {
        context,
        result: {
          allowed: false,
          errorCode: 'INSUFFICIENT_ROLE',
          reason: `Insufficient role level. Required: ${options.minRoleLevel}`,
          deniedByLayer: 'authorization',
        },
      };
    }
  }

  // Layer 2: Minimum Role Check
  if (options.minRole) {
    if (!hasMinimumRole(context, options.minRole)) {
      await logSecurityEvent(supabaseClient, {
        eventType: 'permission_denied',
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        securityLayer: 'authorization',
        errorCode: 'INSUFFICIENT_ROLE',
        metadata: { requiredRole: options.minRole, userRole: context.role },
      });

      return {
        context,
        result: {
          allowed: false,
          errorCode: 'INSUFFICIENT_ROLE',
          reason: `${options.minRole} role or higher required`,
          deniedByLayer: 'authorization',
        },
      };
    }
  }

  // Layer 2: Permission Check
  if (options.permission && context.userId) {
    const hasPerm = await hasPermission(supabaseClient, context.userId, options.permission);
    if (!hasPerm) {
      await logSecurityEvent(supabaseClient, {
        eventType: 'permission_denied',
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        permissionChecked: options.permission,
        securityLayer: 'authorization',
        errorCode: 'PERMISSION_DENIED',
      });

      return {
        context,
        result: {
          allowed: false,
          errorCode: 'PERMISSION_DENIED',
          reason: `Missing required permission: ${options.permission}`,
          deniedByLayer: 'authorization',
        },
      };
    }
  }

  // Layer 3: Ownership Check
  if (options.ownership && context.userId) {
    const { tableName, resourceId, ownerColumn, adminBypass = true } = options.ownership;

    // Admin bypass
    if (adminBypass && isAdmin(context)) {
      // Admin bypasses ownership check
    } else {
      const isOwner = await isResourceOwner(
        supabaseClient,
        context.userId,
        tableName,
        resourceId,
        ownerColumn
      );

      if (!isOwner) {
        await logSecurityEvent(supabaseClient, {
          eventType: 'ownership_denied',
          userId: context.userId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          resourceType: tableName,
          resourceId,
          securityLayer: 'ownership',
          errorCode: 'NOT_OWNER',
        });

        return {
          context,
          result: {
            allowed: false,
            errorCode: 'NOT_OWNER',
            reason: 'You do not own this resource',
            deniedByLayer: 'ownership',
          },
        };
      }
    }
  }

  return {
    context,
    result: { allowed: true },
  };
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Require authentication only
 */
export async function requireAuth(
  req: Request,
  supabaseClient: SupabaseClient
): Promise<{ context: SecurityContext; result: SecurityCheckResult }> {
  return securityMiddleware(req, supabaseClient, { requireAuth: true });
}

/**
 * Require admin role
 */
export async function requireAdmin(
  req: Request,
  supabaseClient: SupabaseClient
): Promise<{ context: SecurityContext; result: SecurityCheckResult }> {
  return securityMiddleware(req, supabaseClient, {
    requireAuth: true,
    minRole: 'admin',
  });
}

/**
 * Require specific permission
 */
export async function requirePermission(
  req: Request,
  supabaseClient: SupabaseClient,
  permission: string
): Promise<{ context: SecurityContext; result: SecurityCheckResult }> {
  return securityMiddleware(req, supabaseClient, {
    requireAuth: true,
    permission,
  });
}

/**
 * Require resource ownership
 */
export async function requireOwnership(
  req: Request,
  supabaseClient: SupabaseClient,
  tableName: string,
  resourceId: string,
  ownerColumn = 'user_id'
): Promise<{ context: SecurityContext; result: SecurityCheckResult }> {
  return securityMiddleware(req, supabaseClient, {
    requireAuth: true,
    ownership: { tableName, resourceId, ownerColumn },
  });
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

interface SecurityLogEvent {
  eventType: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  resourceType?: string;
  resourceId?: string;
  permissionChecked?: string;
  securityLayer?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log security event
 */
export async function logSecurityEvent(
  supabaseClient: SupabaseClient,
  event: SecurityLogEvent
): Promise<void> {
  try {
    await supabaseClient.rpc('log_security_event', {
      p_event_type: event.eventType,
      p_user_id: event.userId,
      p_ip_address: event.ipAddress,
      p_user_agent: event.userAgent,
      p_resource_type: event.resourceType,
      p_resource_id: event.resourceId,
      p_permission_checked: event.permissionChecked,
      p_security_layer: event.securityLayer,
      p_error_code: event.errorCode,
      p_metadata: event.metadata || null,
    });
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('Failed to log security event:', error);
  }
}

// =============================================================================
// RESPONSE HELPERS
// =============================================================================

import { corsHeaders } from './cors.ts';

/**
 * Create an error response for security violations
 */
export function securityErrorResponse(result: SecurityCheckResult): Response {
  const statusCode = result.errorCode === 'UNAUTHENTICATED' ? 401 :
    result.errorCode === 'PERMISSION_DENIED' || result.errorCode === 'INSUFFICIENT_ROLE' ? 403 :
    result.errorCode === 'NOT_OWNER' ? 403 : 400;

  return new Response(
    JSON.stringify({
      error: result.reason || 'Access denied',
      code: result.errorCode,
      layer: result.deniedByLayer,
    }),
    {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Wrap an edge function handler with security middleware
 */
export function withSecurity(
  options: SecurityMiddlewareOptions,
  handler: (
    req: Request,
    context: SecurityContext,
    supabaseClient: SupabaseClient
  ) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // Run security middleware
    const { context, result } = await securityMiddleware(req, supabaseClient, options);

    if (!result.allowed) {
      return securityErrorResponse(result);
    }

    // Call the handler
    return handler(req, context, supabaseClient);
  };
}
