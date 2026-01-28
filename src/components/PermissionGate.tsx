/**
 * PermissionGate Component
 *
 * Conditionally renders content based on user permissions.
 *
 * Usage:
 *
 * ```tsx
 * import { PermissionGate, PERMISSIONS } from '@/components/PermissionGate';
 *
 * // Simple permission check
 * <PermissionGate permission={PERMISSIONS.EVENTS_UPDATE_ANY}>
 *   <AdminControls />
 * </PermissionGate>
 *
 * // With fallback
 * <PermissionGate
 *   permission={PERMISSIONS.EVENTS_UPDATE_OWN}
 *   fallback={<ReadOnlyView />}
 * >
 *   <EditableView />
 * </PermissionGate>
 *
 * // Multiple permissions (any)
 * <PermissionGate anyPermissions={[PERMISSIONS.EVENTS_UPDATE_OWN, PERMISSIONS.EVENTS_UPDATE_ANY]}>
 *   <EditButton />
 * </PermissionGate>
 *
 * // Role-based
 * <PermissionGate minRole="admin">
 *   <AdminPanel />
 * </PermissionGate>
 * ```
 */

import { ReactNode } from 'react';
import { Loader2, Lock, ShieldAlert } from 'lucide-react';
import { usePermission, PERMISSIONS } from '@/hooks/usePermission';
import { type Permission, type UserRole } from '@/lib/security';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Re-export PERMISSIONS for convenience
export { PERMISSIONS };

interface PermissionGateBaseProps {
  /** Content to show when permission is granted */
  children: ReactNode;

  /** Content to show when permission is denied */
  fallback?: ReactNode;

  /** Content to show while loading */
  loadingFallback?: ReactNode;

  /** Display mode for denied state */
  deniedMode?: 'hide' | 'message' | 'card';
}

interface PermissionGateSingleProps extends PermissionGateBaseProps {
  /** Single permission to check */
  permission: Permission;
  anyPermissions?: never;
  allPermissions?: never;
  minRole?: never;
}

interface PermissionGateAnyProps extends PermissionGateBaseProps {
  /** Require any of these permissions */
  anyPermissions: Permission[];
  permission?: never;
  allPermissions?: never;
  minRole?: never;
}

interface PermissionGateAllProps extends PermissionGateBaseProps {
  /** Require all of these permissions */
  allPermissions: Permission[];
  permission?: never;
  anyPermissions?: never;
  minRole?: never;
}

interface PermissionGateRoleProps extends PermissionGateBaseProps {
  /** Minimum role required */
  minRole: UserRole;
  permission?: never;
  anyPermissions?: never;
  allPermissions?: never;
}

type PermissionGateProps =
  | PermissionGateSingleProps
  | PermissionGateAnyProps
  | PermissionGateAllProps
  | PermissionGateRoleProps;

export function PermissionGate(props: PermissionGateProps) {
  const {
    children,
    fallback,
    loadingFallback,
    deniedMode = 'hide',
  } = props;

  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasMinimumRole,
    isLoading,
  } = usePermission();

  // Show loading state
  if (isLoading) {
    return loadingFallback !== undefined ? (
      <>{loadingFallback}</>
    ) : deniedMode === 'hide' ? null : (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Check permission based on prop type
  let isAllowed = false;

  if ('permission' in props && props.permission) {
    isAllowed = hasPermission(props.permission);
  } else if ('anyPermissions' in props && props.anyPermissions) {
    isAllowed = hasAnyPermission(props.anyPermissions);
  } else if ('allPermissions' in props && props.allPermissions) {
    isAllowed = hasAllPermissions(props.allPermissions);
  } else if ('minRole' in props && props.minRole) {
    isAllowed = hasMinimumRole(props.minRole);
  }

  // Render allowed content
  if (isAllowed) {
    return <>{children}</>;
  }

  // Render denied state
  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  switch (deniedMode) {
    case 'hide':
      return null;

    case 'message':
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
          <Lock className="h-4 w-4" />
          <span>You don't have permission to access this</span>
        </div>
      );

    case 'card':
      return (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-base">
              <ShieldAlert className="h-5 w-5" />
              Access Restricted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              You don't have the required permissions to access this feature.
              Please contact an administrator if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      );

    default:
      return null;
  }
}

// =============================================================================
// CONVENIENCE COMPONENTS
// =============================================================================

/**
 * Gate that requires admin role
 */
export function AdminGate({
  children,
  fallback,
  loadingFallback,
  deniedMode = 'hide',
}: Omit<PermissionGateBaseProps, 'permission'>) {
  return (
    <PermissionGate
      minRole="admin"
      fallback={fallback}
      loadingFallback={loadingFallback}
      deniedMode={deniedMode}
    >
      {children}
    </PermissionGate>
  );
}

/**
 * Gate that requires moderator role or higher
 */
export function ModeratorGate({
  children,
  fallback,
  loadingFallback,
  deniedMode = 'hide',
}: Omit<PermissionGateBaseProps, 'permission'>) {
  return (
    <PermissionGate
      minRole="moderator"
      fallback={fallback}
      loadingFallback={loadingFallback}
      deniedMode={deniedMode}
    >
      {children}
    </PermissionGate>
  );
}

/**
 * Gate for content management (update any content)
 */
export function ContentManagerGate({
  children,
  resourceType,
  fallback,
  loadingFallback,
  deniedMode = 'hide',
}: Omit<PermissionGateBaseProps, 'permission'> & { resourceType: string }) {
  return (
    <PermissionGate
      anyPermissions={[
        `${resourceType}.update.any`,
        `${resourceType}.delete.any`,
      ]}
      fallback={fallback}
      loadingFallback={loadingFallback}
      deniedMode={deniedMode}
    >
      {children}
    </PermissionGate>
  );
}

// =============================================================================
// OWNERSHIP-BASED GATE
// =============================================================================

interface OwnershipGateProps {
  /** Content to show when permission is granted */
  children: ReactNode;

  /** The owner's user ID */
  ownerId: string | null | undefined;

  /** Whether to allow admins to bypass ownership check */
  adminBypass?: boolean;

  /** Content to show when not the owner */
  fallback?: ReactNode;

  /** Display mode for denied state */
  deniedMode?: 'hide' | 'message';
}

/**
 * Gate that checks resource ownership
 *
 * ```tsx
 * <OwnershipGate ownerId={event.created_by}>
 *   <EditButton />
 * </OwnershipGate>
 * ```
 */
export function OwnershipGate({
  children,
  ownerId,
  adminBypass = true,
  fallback,
  deniedMode = 'hide',
}: OwnershipGateProps) {
  const { isAdmin, isLoading } = usePermission();
  const { context } = require('@/hooks/useSecurityContext').useSecurityContext();

  if (isLoading) {
    return null;
  }

  // Admin bypass
  if (adminBypass && isAdmin) {
    return <>{children}</>;
  }

  // Check ownership
  const isOwner = context.userId && ownerId && context.userId === ownerId;

  if (isOwner) {
    return <>{children}</>;
  }

  // Show fallback or nothing
  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  if (deniedMode === 'message') {
    return (
      <span className="text-xs text-muted-foreground">
        (owner only)
      </span>
    );
  }

  return null;
}
