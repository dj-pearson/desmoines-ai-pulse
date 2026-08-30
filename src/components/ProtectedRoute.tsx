import { ReactNode, useEffect, useRef } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { type Permission, type UserRole } from "@/lib/security";
import { sessionStore } from "@/lib/safeStorage";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Require admin role (legacy - use minRole instead) */
  requireAdmin?: boolean;
  /** Minimum role required to access this route */
  minRole?: UserRole;
  /** Required permission to access this route */
  permission?: Permission;
  /** Any of these permissions grants access */
  anyPermissions?: Permission[];
  /** Custom message for access denied */
  deniedMessage?: string;
}

/**
 * ProtectedRoute Component
 *
 * Wraps protected pages to ensure authentication and authorization before rendering.
 *
 * Security Layers Implemented:
 * - Layer 1 (Authentication): Verifies user is logged in
 * - Layer 2 (Authorization): Checks roles and permissions
 *
 * Features:
 * - Silent auth check with loading state (no premature redirects)
 * - Stores intended route in URL params for post-login redirect
 * - Prevents flickering and position loss on page reload
 * - Role-based access control (admin, moderator, etc.)
 * - Permission-based access control (granular permissions)
 * - Waits for permission check to complete before rendering
 *
 * Usage:
 * ```tsx
 * // Basic authentication only
 * <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
 *
 * // Admin only (legacy)
 * <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
 *
 * // Minimum role
 * <Route path="/moderate" element={<ProtectedRoute minRole="moderator"><Moderate /></ProtectedRoute>} />
 *
 * // Specific permission
 * <Route path="/events/new" element={
 *   <ProtectedRoute permission="events.create.own">
 *     <CreateEvent />
 *   </ProtectedRoute>
 * } />
 *
 * // Any of multiple permissions
 * <Route path="/events/:id/edit" element={
 *   <ProtectedRoute anyPermissions={['events.update.own', 'events.update.any']}>
 *     <EditEvent />
 *   </ProtectedRoute>
 * } />
 * ```
 */
export function ProtectedRoute({
  children,
  requireAdmin = false,
  minRole,
  permission,
  anyPermissions,
  deniedMessage,
}: ProtectedRouteProps) {
  const { user, isLoading, isAdmin, isAdminLoading } = useAuth();
  const {
    hasPermission,
    hasAnyPermission,
    hasMinimumRole,
    isLoading: permissionLoading,
  } = usePermission();
  const location = useLocation();

  // Determine if we need role/permission checks
  const needsRoleCheck = requireAdmin || minRole;
  const needsPermissionCheck = permission || (anyPermissions && anyPermissions.length > 0);

  // Clear any stored errors on successful navigation to a protected route
  useEffect(() => {
    if (user && !isLoading) {
      sessionStore.remove('app_errors');
    }
  }, [user, isLoading]);

  // CRITICAL: Show loading state while auth is initializing
  // This prevents premature redirects during session restoration
  // Also wait for permission checks if needed
  const stillLoading =
    isLoading ||
    (requireAdmin && isAdminLoading) ||
    (needsPermissionCheck && permissionLoading);

  // Whether this user currently satisfies every check on this route.
  const passesAllChecks =
    !!user &&
    !(requireAdmin && !isAdmin) &&
    !(minRole && !hasMinimumRole(minRole)) &&
    !(permission && !hasPermission(permission)) &&
    !(anyPermissions && anyPermissions.length > 0 && !hasAnyPermission(anyPermissions));

  // Remember that this user was fully verified for this route.
  //
  // Once the page is on screen we must never swap it back out for a spinner:
  // unmounting it destroys everything the user was doing — the open tab, the
  // scroll position, half-filled forms. Auth layers re-report "loading" for
  // reasons that have nothing to do with the user (a session refresh when the
  // browser tab regains focus, a permission re-fetch), and those re-checks
  // belong in the background. Real access loss is still enforced: the
  // authorization checks below run on every render, and a sign-out clears the
  // grant via `user` going null. (WEB-UX-008)
  const verifiedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      verifiedUserIdRef.current = null;
      return;
    }
    if (!stillLoading && passesAllChecks) {
      verifiedUserIdRef.current = user.id;
    }
  }, [user, stillLoading, passesAllChecks]);

  const isReVerifyingInBackground =
    stillLoading && !!user && verifiedUserIdRef.current === user.id;

  if (stillLoading && !isReVerifyingInBackground) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">
            {requireAdmin && isAdminLoading
              ? "Verifying admin access..."
              : needsPermissionCheck
              ? "Checking permissions..."
              : "Verifying authentication..."}
          </p>
        </div>
      </div>
    );
  }

  // Layer 1: Authentication Check
  // User is not authenticated - redirect to auth with intended destination
  if (!user) {
    // Store the current location so we can redirect back after login
    const redirectTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirectTo)}`} replace />;
  }

  // Layer 2: Authorization Checks

  // Check admin requirement (legacy support)
  if (requireAdmin && !isAdmin) {
    return (
      <AccessDeniedPage
        message={deniedMessage || "Admin access is required to view this page."}
      />
    );
  }

  // Check minimum role requirement
  if (minRole && !hasMinimumRole(minRole)) {
    return (
      <AccessDeniedPage
        message={
          deniedMessage ||
          `This page requires ${minRole} access or higher.`
        }
      />
    );
  }

  // Check specific permission requirement
  if (permission && !hasPermission(permission)) {
    return (
      <AccessDeniedPage
        message={
          deniedMessage ||
          "You don't have the required permission to access this page."
        }
      />
    );
  }

  // Check any of multiple permissions
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

  // All checks passed - render children
  return <>{children}</>;
}

/**
 * Access Denied Page Component
 * Shown when a user lacks required permissions
 */
function AccessDeniedPage({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border rounded-lg p-6 text-center">
        <div className="mb-4">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Button
            onClick={() => navigate("/")}
          >
            Go Home
          </Button>
        </div>
      </div>
    </div>
  );
}
