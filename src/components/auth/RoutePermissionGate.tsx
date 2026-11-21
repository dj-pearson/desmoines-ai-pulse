import { ReactNode, useEffect, useRef } from "react";
import { usePermission } from "@/hooks/usePermission";
import type { Permission, UserRole } from "@/lib/security";
import { AccessDeniedPage, VerifyingScreen } from "./RouteGateScreens";

export interface RoutePermissionGateProps {
  children: ReactNode;
  userId: string;
  minRole?: UserRole;
  permission?: Permission;
  anyPermissions?: Permission[];
  deniedMessage?: string;
}

/**
 * The role and permission half of ProtectedRoute. Mounted only for a route
 * that sets minRole, permission or anyPermissions, so usePermission's reads
 * happen only where an answer is needed.
 *
 * Lazy-loaded by ProtectedRoute (WEB-PERF-062): usePermission,
 * useSecurityContext and lib/security (the role-permission map) were in the
 * entry chunk for every visitor, and no route in App.tsx sets these props
 * today. Default export so React.lazy can take the module as-is.
 */
export default function RoutePermissionGate({
  children,
  userId,
  minRole,
  permission,
  anyPermissions,
  deniedMessage,
}: RoutePermissionGateProps) {
  const {
    hasPermission,
    hasAnyPermission,
    hasMinimumRole,
    isLoading: permissionLoading,
  } = usePermission();

  const passesAllChecks =
    !(minRole && !hasMinimumRole(minRole)) &&
    !(permission && !hasPermission(permission)) &&
    !(anyPermissions && anyPermissions.length > 0 && !hasAnyPermission(anyPermissions));

  // WEB-UX-008: once this user passed, a background permission re-fetch must
  // not swap the page for a spinner.
  const verifiedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!permissionLoading && passesAllChecks) {
      verifiedUserIdRef.current = userId;
    }
  }, [userId, permissionLoading, passesAllChecks]);

  if (permissionLoading && verifiedUserIdRef.current !== userId) {
    return <VerifyingScreen message="Checking permissions..." />;
  }

  if (minRole && !hasMinimumRole(minRole)) {
    return (
      <AccessDeniedPage
        message={deniedMessage || `This page requires ${minRole} access or higher.`}
      />
    );
  }

  if (permission && !hasPermission(permission)) {
    return (
      <AccessDeniedPage
        message={
          deniedMessage || "You don't have the required permission to access this page."
        }
      />
    );
  }

  if (anyPermissions && anyPermissions.length > 0 && !hasAnyPermission(anyPermissions)) {
    return (
      <AccessDeniedPage
        message={
          deniedMessage ||
          "You don't have any of the required permissions to access this page."
        }
      />
    );
  }

  return <>{children}</>;
}
