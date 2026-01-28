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

  const buildContext = useCallback(async () => {
    if (authLoading) return;

    if (!isAuthenticated || !user) {
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
        .eq('user_id', user.id)
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
          .eq('id', user.id)
          .single();

        if (profileData?.user_role) {
          role = profileData.user_role as UserRole;
        }
      }

      const permissions = getPermissionsForRole(role);

      setContext({
        isAuthenticated: true,
        userId: user.id,
        email: user.email || null,
        role,
        roleLevel: getRoleLevel(role),
        permissions,
        sessionId: user.id.slice(-8), // Last 8 chars for logging
      });
      setError(null);
    } catch (err) {
      console.error('Error building security context:', err);
      setError(err instanceof Error ? err : new Error('Failed to build security context'));
      // Still set a basic authenticated context
      setContext({
        isAuthenticated: true,
        userId: user.id,
        email: user.email || null,
        role: 'user',
        roleLevel: getRoleLevel('user'),
        permissions: getPermissionsForRole('user'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, isAuthenticated, isAdmin, authLoading]);

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
