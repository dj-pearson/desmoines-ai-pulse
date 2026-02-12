/**
 * useResourceOwnership Hook
 *
 * Check if the current user owns a specific resource.
 *
 * Usage:
 *
 * ```tsx
 * import { useResourceOwnership } from '@/hooks/useResourceOwnership';
 *
 * function EventEditor({ eventId }: { eventId: string }) {
 *   const { isOwner, isLoading, canEdit, canDelete } = useResourceOwnership('event', eventId);
 *
 *   if (isLoading) return <Spinner />;
 *
 *   if (!canEdit) {
 *     return <AccessDenied />;
 *   }
 *
 *   return <EventForm />;
 * }
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSecurityContext } from './useSecurityContext';
import { usePermission, PERMISSIONS } from './usePermission';
import { createLogger } from '@/lib/logger';
import {
  type OwnableResource,
  type OwnershipConfig,
  isResourceOwner,
  checkOwnership,
  isAdmin,
} from '@/lib/security';

const log = createLogger('useResourceOwnership');

interface UseResourceOwnershipOptions extends Partial<OwnershipConfig> {
  /** Skip the ownership check (useful for conditional rendering) */
  skip?: boolean;
}

interface UseResourceOwnershipReturn {
  /** Whether the current user owns the resource */
  isOwner: boolean;

  /** Whether ownership check is loading */
  isLoading: boolean;

  /** Error if ownership check failed */
  error: Error | null;

  /** Whether the user can view the resource */
  canView: boolean;

  /** Whether the user can edit the resource (owner or admin) */
  canEdit: boolean;

  /** Whether the user can delete the resource (owner or admin) */
  canDelete: boolean;

  /** Refresh the ownership check */
  refresh: () => Promise<void>;
}

export function useResourceOwnership(
  resourceType: OwnableResource,
  resourceId: string | null | undefined,
  options?: UseResourceOwnershipOptions
): UseResourceOwnershipReturn {
  const { context, isLoading: contextLoading } = useSecurityContext();
  const { hasPermission } = usePermission();

  const [isOwner, setIsOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const checkOwnershipStatus = useCallback(async () => {
    // Skip if disabled or no resource ID
    if (options?.skip || !resourceId) {
      setIsOwner(false);
      setIsLoading(false);
      return;
    }

    // Wait for context to be ready
    if (contextLoading) return;

    // Unauthenticated users don't own anything
    if (!context.isAuthenticated || !context.userId) {
      setIsOwner(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const owned = await isResourceOwner(context, resourceType, resourceId, options);
      setIsOwner(owned);
      setError(null);
    } catch (err) {
      log.error(`Error checking ownership for ${resourceType}:${resourceId}`, { action: 'checkOwnership', metadata: { error: err } });
      setError(err instanceof Error ? err : new Error('Failed to check ownership'));
      setIsOwner(false);
    } finally {
      setIsLoading(false);
    }
  }, [context, contextLoading, resourceType, resourceId, options?.skip]);

  useEffect(() => {
    checkOwnershipStatus();
  }, [checkOwnershipStatus]);

  // Calculate permissions based on ownership and role
  const permissions = useMemo(() => {
    const userIsAdmin = isAdmin(context);
    const resourcePlural = `${resourceType}s`;

    // Check for 'any' scope permissions (admin)
    const hasViewAny = hasPermission(`${resourcePlural}.view.any`);
    const hasUpdateAny = hasPermission(`${resourcePlural}.update.any`);
    const hasDeleteAny = hasPermission(`${resourcePlural}.delete.any`);

    // Check for 'own' scope permissions
    const hasViewOwn = hasPermission(`${resourcePlural}.view.own`);
    const hasUpdateOwn = hasPermission(`${resourcePlural}.update.own`);
    const hasDeleteOwn = hasPermission(`${resourcePlural}.delete.own`);

    // Calculate effective permissions
    const canView = hasViewAny || (hasViewOwn && isOwner) || userIsAdmin;
    const canEdit = hasUpdateAny || (hasUpdateOwn && isOwner) || userIsAdmin;
    const canDelete = hasDeleteAny || (hasDeleteOwn && isOwner) || userIsAdmin;

    return { canView, canEdit, canDelete };
  }, [context, hasPermission, resourceType, isOwner]);

  return useMemo(() => ({
    isOwner,
    isLoading: isLoading || contextLoading,
    error,
    canView: permissions.canView,
    canEdit: permissions.canEdit,
    canDelete: permissions.canDelete,
    refresh: checkOwnershipStatus,
  }), [
    isOwner,
    isLoading,
    contextLoading,
    error,
    permissions,
    checkOwnershipStatus,
  ]);
}

/**
 * Hook to check if user can perform a specific action on a resource
 *
 * ```tsx
 * const canEditEvent = useCanPerformAction('event', eventId, 'update');
 * ```
 */
export function useCanPerformAction(
  resourceType: OwnableResource,
  resourceId: string | null | undefined,
  action: 'view' | 'create' | 'update' | 'delete'
): { allowed: boolean; isLoading: boolean } {
  const ownership = useResourceOwnership(resourceType, resourceId);

  const allowed = useMemo(() => {
    switch (action) {
      case 'view':
        return ownership.canView;
      case 'update':
        return ownership.canEdit;
      case 'delete':
        return ownership.canDelete;
      case 'create':
        // Create doesn't require ownership check
        return true;
      default:
        return false;
    }
  }, [action, ownership]);

  return { allowed, isLoading: ownership.isLoading };
}

/**
 * Quick ownership check for inline use
 * Useful when you have the owner ID already
 *
 * ```tsx
 * const isMyEvent = useQuickOwnershipCheck(event.created_by);
 * ```
 */
export function useQuickOwnershipCheck(ownerId: string | null | undefined): boolean {
  const { context, isLoading } = useSecurityContext();

  if (isLoading || !context.isAuthenticated || !context.userId || !ownerId) {
    return false;
  }

  return context.userId === ownerId || isAdmin(context);
}
