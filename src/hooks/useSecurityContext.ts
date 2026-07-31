/**
 * useSecurityContext Hook
 *
 * Provides the security context for the current user, including:
 * - Authentication status
 * - User role and level
 * - Permissions
 *
 * This is the foundation for all other security hooks.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  type SecurityContext,
  type UserRole,
  createAnonymousContext,
  getRoleLevel,
  getPermissionsForRole,
} from '@/lib/security';

interface UseSecurityContextReturn {
  /** The current security context */
  context: SecurityContext;

  /** Whether the context is still loading */
  isLoading: boolean;

  /** Error if context failed to load */
  error: Error | null;

  /** Manually refresh the security context */
  refresh: () => Promise<void>;
}

export function useSecurityContext(): UseSecurityContextReturn {
  const { user, isAuthenticated, isAdmin, isLoading: authLoading } = useAuth();
  const [context, setContext] = useState<SecurityContext>(createAnonymousContext());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Depend on the identity fields, not the `user` object. Supabase hands us a
  // brand-new user object on every token refresh and on every tab-focus session
  // recovery; keying the effect on the object would re-query the role (and
  // re-render every permission consumer) each time, for an answer that cannot
  // have changed. (WEB-UX-008)
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;

  const buildContext = useCallback(async () => {
    if (authLoading) return;

    if (!isAuthenticated || !userId) {
      setContext(createAnonymousContext());
      setIsLoading(false);
      return;
    }

    try {
      // Fetch the user's role from the database
      let role: UserRole = 'user';

      // First check user_roles table
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .in('role', ['root_admin', 'admin', 'moderator'])
        .order('role')
        .limit(1)
        .maybeSingle();

      if (roleData?.role) {
        role = roleData.role as UserRole;
      } else if (isAdmin) {
        // Fallback to isAdmin from auth context
        role = 'admin';
      } else {
        // Check profiles table for legacy role
        const { data: profileData } = await supabase
          .from('profiles')
          .select('user_role')
          .eq('id', userId)
          .single();

        if (profileData?.user_role) {
          role = profileData.user_role as UserRole;
        }
      }

      const permissions = getPermissionsForRole(role);

      setContext({
        isAuthenticated: true,
        userId,
        email: userEmail,
        role,
        roleLevel: getRoleLevel(role),
        permissions,
        sessionId: userId.slice(-8), // Last 8 chars for logging
      });
      setError(null);
    } catch (err) {
      console.error('Error building security context:', err);
      setError(err instanceof Error ? err : new Error('Failed to build security context'));
      // Still set a basic authenticated context
      setContext({
        isAuthenticated: true,
        userId,
        email: userEmail,
        role: 'user',
        roleLevel: getRoleLevel('user'),
        permissions: getPermissionsForRole('user'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [userId, userEmail, isAuthenticated, isAdmin, authLoading]);

  useEffect(() => {
    buildContext();
  }, [buildContext]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await buildContext();
  }, [buildContext]);

  return useMemo(() => ({
    context,
    isLoading: isLoading || authLoading,
    error,
    refresh,
  }), [context, isLoading, authLoading, error, refresh]);
}
