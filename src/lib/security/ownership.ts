/**
 * Resource Ownership Utilities
 *
 * Layer 3: Resource Ownership - IS this yours?
 *
 * Provides functions to verify that a user has access to a specific resource
 * based on ownership, team membership, or tenant association.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  type SecurityContext,
  type SecurityCheckResult,
  type OwnableResource,
  type OwnershipConfig,
  OWNERSHIP_COLUMNS,
} from './types';
import { isAdmin } from './permissions';
import { createLogger } from '@/lib/logger';

const logger = createLogger('SecurityOwnership');

// =============================================================================
// OWNERSHIP CHECKING
// =============================================================================

/**
 * Check if a user owns a specific resource
 *
 * @param context - Security context
 * @param resourceType - Type of resource to check
 * @param resourceId - ID of the resource
 * @param config - Optional configuration overrides
 * @returns Promise resolving to whether the user owns the resource
 */
export async function isResourceOwner(
  context: SecurityContext | undefined,
  resourceType: OwnableResource,
  resourceId: string,
  config?: Partial<OwnershipConfig>
): Promise<boolean> {
  if (!context?.userId) return false;

  const ownerColumn = config?.ownerColumn || OWNERSHIP_COLUMNS[resourceType];
  const tableName = getTableName(resourceType);

  if (!tableName) {
    logger.error('isResourceOwner', 'Unknown resource type', { resourceType });
    return false;
  }

  try {
    const { data, error } = await (supabase
      .from(tableName as any)
      .select(ownerColumn) as any)
      .eq('id', resourceId)
      .single();

    if (error || !data) {
      return false;
    }

    // Check direct ownership
    const ownerId = (data as any)[ownerColumn];
    return ownerId === context.userId;
  } catch (error) {
    logger.error('isResourceOwner', 'Error checking ownership', { resourceType, resourceId, error: String(error) });
    return false;
  }
}

/**
 * Check ownership and return a detailed result
 *
 * @param context - Security context
 * @param resourceType - Type of resource to check
 * @param resourceId - ID of the resource
 * @param config - Optional configuration overrides
 * @returns Promise resolving to detailed ownership check result
 */
export async function checkOwnership(
  context: SecurityContext | undefined,
  resourceType: OwnableResource,
  resourceId: string,
  config?: Partial<OwnershipConfig>
): Promise<SecurityCheckResult> {
  // Check authentication first
  if (!context?.isAuthenticated || !context.userId) {
    return {
      allowed: false,
      errorCode: 'UNAUTHENTICATED',
      reason: 'User must be authenticated to access this resource',
      deniedByLayer: 'authentication',
    };
  }

  // Admin bypass if enabled
  if (config?.adminBypass !== false && isAdmin(context)) {
    return { allowed: true };
  }

  // Check team access if enabled
  if (config?.allowTeamAccess) {
    const hasTeamAccess = await checkTeamAccess(context, resourceType, resourceId);
    if (hasTeamAccess) {
      return { allowed: true };
    }
  }

  // Check direct ownership
  const isOwner = await isResourceOwner(context, resourceType, resourceId, config);
  if (!isOwner) {
    return {
      allowed: false,
      errorCode: 'NOT_OWNER',
      reason: `User does not own this ${resourceType}`,
      deniedByLayer: 'ownership',
    };
  }

  return { allowed: true };
}

/**
 * Check if user has team access to a resource
 */
async function checkTeamAccess(
  context: SecurityContext,
  resourceType: OwnableResource,
  resourceId: string
): Promise<boolean> {
  if (!context.userId) return false;

  // Currently only campaigns support team access
  if (resourceType === 'campaign') {
    try {
      const { data, error } = await supabase
        .from('campaign_team_members')
        .select('id')
        .eq('team_member_id', context.userId)
        .eq('invitation_status', 'accepted')
        .limit(1);

      if (error) {
        logger.error('checkTeamAccess', 'Error checking team access', { error: String(error) });
        return false;
      }

      // Check if the campaign belongs to a team member's owner
      if (data && data.length > 0) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('user_id')
          .eq('id', resourceId)
          .single();

        if (campaign) {
          const { data: teamMembership } = await supabase
            .from('campaign_team_members')
            .select('id')
            .eq('team_member_id', context.userId)
            .eq('campaign_owner_id', campaign.user_id)
            .eq('invitation_status', 'accepted')
            .single();

          return !!teamMembership;
        }
      }
    } catch (error) {
      logger.error('checkTeamAccess', 'Error checking team access for campaign', { error: String(error) });
    }
  }

  return false;
}

// =============================================================================
// TENANT FILTERING
// =============================================================================

/**
 * Apply tenant filter to a query
 * Ensures users only see data from their own tenant/organization
 *
 * @param query - Supabase query builder
 * @param context - Security context
 * @param tenantColumn - Column name for tenant ID (default: 'tenant_id')
 * @returns Filtered query
 */
export function applyTenantFilter<T>(
  query: T,
  context: SecurityContext | undefined,
  tenantColumn = 'tenant_id'
): T {
  // If no tenant context, return query as-is (let RLS handle it)
  if (!context?.tenantId) return query;

  // This is a type assertion as Supabase query types are complex
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (query as any).eq(tenantColumn, context.tenantId) as T;
}

/**
 * Apply owner filter to a query
 * Ensures users only see their own data for "own" scoped permissions
 *
 * @param query - Supabase query builder
 * @param context - Security context
 * @param ownerColumn - Column name for owner ID (default: 'user_id')
 * @returns Filtered query
 */
export function applyOwnerFilter<T>(
  query: T,
  context: SecurityContext | undefined,
  ownerColumn = 'user_id'
): T {
  // If no user context, return query as-is (let RLS handle it)
  if (!context?.userId) return query;

  // This is a type assertion as Supabase query types are complex
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (query as any).eq(ownerColumn, context.userId) as T;
}

// =============================================================================
// RESOURCE VALIDATION
// =============================================================================

/**
 * Validate that a resource exists and user has access
 *
 * @param context - Security context
 * @param resourceType - Type of resource
 * @param resourceId - ID of the resource
 * @param config - Configuration for the check
 * @returns Promise resolving to validation result with resource data
 */
export async function validateResourceAccess<T = Record<string, unknown>>(
  context: SecurityContext | undefined,
  resourceType: OwnableResource,
  resourceId: string,
  config?: Partial<OwnershipConfig> & { select?: string }
): Promise<{ allowed: boolean; resource?: T; error?: SecurityCheckResult }> {
  const tableName = getTableName(resourceType);
  if (!tableName) {
    return {
      allowed: false,
      error: {
        allowed: false,
        errorCode: 'RLS_DENIED',
        reason: `Unknown resource type: ${resourceType}`,
        deniedByLayer: 'ownership',
      },
    };
  }

  try {
    // Fetch the resource
    const { data, error } = await (supabase
      .from(tableName as any)
      .select(config?.select || '*') as any)
      .eq('id', resourceId)
      .single();

    if (error || !data) {
      return {
        allowed: false,
        error: {
          allowed: false,
          errorCode: 'RLS_DENIED',
          reason: 'Resource not found or access denied',
          deniedByLayer: 'rls',
        },
      };
    }

    // Check ownership
    const ownershipCheck = await checkOwnership(context, resourceType, resourceId, config);
    if (!ownershipCheck.allowed) {
      return { allowed: false, error: ownershipCheck };
    }

    return { allowed: true, resource: data as T };
  } catch (error) {
    logger.error('validateResourceAccess', 'Error validating resource access', { resourceType, resourceId, error: String(error) });
    return {
      allowed: false,
      error: {
        allowed: false,
        errorCode: 'RLS_DENIED',
        reason: 'Error checking resource access',
        deniedByLayer: 'rls',
      },
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Map resource type to database table name
 */
function getTableName(resourceType: OwnableResource): string | null {
  const tableMap: Record<OwnableResource, string> = {
    event: 'events',
    restaurant: 'restaurants',
    attraction: 'attractions',
    review: 'reviews',
    rating: 'ratings',
    favorite: 'favorites',
    discussion: 'event_discussions',
    discussion_reply: 'discussion_replies',
    photo: 'event_photos',
    campaign: 'campaigns',
    advertisement: 'advertisements',
    profile: 'profiles',
    trip_plan: 'saved_itineraries',
    saved_search: 'saved_searches',
    event_alert: 'event_alerts',
  };

  return tableMap[resourceType] || null;
}

/**
 * Create ownership check for inline use
 * Useful for quick ownership checks without full config
 *
 * @param userId - Current user ID
 * @param ownerId - Owner ID from the resource
 * @param adminBypass - Whether admins can bypass (default: true)
 * @param isUserAdmin - Whether current user is admin
 * @returns Whether access is allowed
 */
export function quickOwnershipCheck(
  userId: string | null | undefined,
  ownerId: string | null | undefined,
  adminBypass = true,
  isUserAdmin = false
): boolean {
  // Admin bypass
  if (adminBypass && isUserAdmin) return true;

  // Must have both IDs
  if (!userId || !ownerId) return false;

  // Direct ownership
  return userId === ownerId;
}

/**
 * Build ownership filter for Supabase queries
 * Returns an object with the appropriate filter conditions
 *
 * @param context - Security context
 * @param scope - Permission scope ('own', 'team', 'any')
 * @param ownerColumn - Column name for owner ID
 * @returns Filter conditions or null if no filter needed
 */
export function buildOwnershipFilter(
  context: SecurityContext | undefined,
  scope: 'own' | 'team' | 'any',
  ownerColumn = 'user_id'
): { column: string; value: string } | null {
  // 'any' scope or admin = no filter
  if (scope === 'any' || isAdmin(context)) {
    return null;
  }

  // Must have user ID for ownership filtering
  if (!context?.userId) {
    // Return impossible filter to prevent data leakage
    return { column: ownerColumn, value: 'INVALID_USER_ID' };
  }

  // 'own' scope = filter to user's resources
  if (scope === 'own') {
    return { column: ownerColumn, value: context.userId };
  }

  // 'team' scope - would need more complex logic for team filtering
  // For now, fall back to own
  return { column: ownerColumn, value: context.userId };
}
