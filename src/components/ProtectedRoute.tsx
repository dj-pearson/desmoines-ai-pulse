import { ReactNode, Suspense, lazy, useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AccessDeniedPage, VerifyingScreen } from "@/components/auth/RouteGateScreens";
import { useAuth } from "@/hooks/useAuth";
import { sessionStore } from "@/lib/safeStorage";
import type { Permission, UserRole } from "@/lib/security";

// The role/permission check (usePermission, useSecurityContext and the
// lib/security role-permission map) is a separate chunk, fetched only when a
// route sets minRole, permission or anyPermissions. ProtectedRoute itself is
// eager because App.tsx wraps routes in it, so a static import here put all of
// that in the entry chunk for every visitor (WEB-PERF-062). A failed fetch
// throws into the route's error boundary: failing closed is right for a gate.
const RoutePermissionGate = lazy(() => import("@/components/auth/RoutePermissionGate"));

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
  // now lives in the lazy RoutePermissionGate and mounts only when a prop asks for it.
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
      <Suspense fallback={<VerifyingScreen message="Checking permissions..." />}>
        <RoutePermissionGate
          userId={user.id}
          minRole={minRole}
          permission={permission}
          anyPermissions={anyPermissions}
          deniedMessage={deniedMessage}
        >
          {children}
        </RoutePermissionGate>
      </Suspense>
    );
  }

  // All checks passed - render children
  return <>{children}</>;
}
