import { ReactNode, useEffect, useRef } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { type Permission, type UserRole } from "@/lib/security";
import { sessionStore } from "@/lib/safeStorage";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loading-skeleton";

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
  const location = useLocation();

  // Role and permission checks need the security context (usePermission ->
  // useSecurityContext), which reads user_roles and profiles. /dashboard,
  // /profile and /my-events set none of these props, and AuthContext has
  // already read both tables, so they were paying for the same two requests
  // again before first paint (account plan WP3 item 11). The permission branch
  // now lives in PermissionGate below and mounts only when a prop asks for it.
  const needsPermissionGate =
    !!minRole || !!permission || (!!anyPermissions && anyPermissions.length > 0);

  // Clear any stored errors on successful navigation to a protected route
  useEffect(() => {
    if (user && !isLoading) {
      sessionStore.remove('app_errors');
    }
  }, [user, isLoading]);

  // CRITICAL: Show loading state while auth is initializing
  // This prevents premature redirects during session restoration
  const stillLoading = isLoading || (requireAdmin && isAdminLoading);

  // Whether this user currently satisfies the auth-level checks on this route.
  const passesAuthChecks = !!user && !(requireAdmin && !isAdmin);

  // Remember that this user was fully verified for this route.
  //
  // Once the page is on screen we must never swap it back out for a spinner:
  // unmounting it destroys everything the user was doing - the open tab, the
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
    if (!stillLoading && passesAuthChecks) {
      verifiedUserIdRef.current = user.id;
    }
  }, [user, stillLoading, passesAuthChecks]);

  const isReVerifyingInBackground =
    stillLoading && !!user && verifiedUserIdRef.current === user.id;

  if (stillLoading && !isReVerifyingInBackground) {
    return (
      <VerifyingScreen
        message={
          requireAdmin && isAdminLoading
            ? "Verifying admin access..."
            : "Verifying authentication..."
        }
      />
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

  if (needsPermissionGate) {
    return (
      <PermissionGate
        userId={user.id}
        minRole={minRole}
        permission={permission}
        anyPermissions={anyPermissions}
        deniedMessage={deniedMessage}
      >
        {children}
      </PermissionGate>
    );
  }

  // All checks passed - render children
  return <>{children}</>;
}

interface PermissionGateProps {
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
 */
function PermissionGate({
  children,
  userId,
  minRole,
  permission,
  anyPermissions,
  deniedMessage,
}: PermissionGateProps) {
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

  // Same WEB-UX-008 rule as above: once this user passed, a background
  // permission re-fetch must not swap the page for a spinner.
  const verifiedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!permissionLoading && passesAllChecks) {
      verifiedUserIdRef.current = userId;
    }
  }, [userId, permissionLoading, passesAllChecks]);

  if (permissionLoading && verifiedUserIdRef.current !== userId) {
    return <VerifyingScreen message="Checking permissions..." />;
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

  return <>{children}</>;
}

function VerifyingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <Spinner size="xl" className="mx-auto" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
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
