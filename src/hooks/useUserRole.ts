import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { User } from "@supabase/supabase-js";

const logger = createLogger('useUserRole');

export type UserRole = 'user' | 'moderator' | 'admin' | 'root_admin';

export interface UserRoleData {
  id: string;
  user_id: string;
  role: UserRole;
  assigned_by: string | null;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

interface RoleState {
  userRole: UserRole;
  isLoading: boolean;
  error: string | null;
}

export function useUserRole(user?: User | null) {
  const [state, setState] = useState<RoleState>({
    userRole: 'user',
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;
    
    const fetchUserRole = async () => {
      logger.debug('fetchUserRole', 'fetchUserRole called', { userId: user?.id || 'null' });

      if (!user) {
        logger.debug('fetchUserRole', 'No user found, setting default role');
        if (isMounted) {
          setState({ userRole: 'user', isLoading: false, error: null });
        }
        return;
      }

      // Keep loading true during the entire fetch operation
      if (isMounted) {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
      }

      try {
        logger.debug('fetchUserRole', 'checking for user ID', { userId: user.id });

        // Check user_roles table first (authoritative source)
        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        logger.debug('fetchUserRole', 'user_roles query result', { roleData, roleError });

        if (!roleError && roleData?.role) {
          logger.debug('fetchUserRole', 'Found role in user_roles', { role: roleData.role });
          if (isMounted) {
            setState({
              userRole: roleData.role as UserRole,
              isLoading: false,
              error: null,
            });
          }
          return;
        }

        // Fallback to profiles table if no role found in user_roles
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("user_role")
          .eq("user_id", user.id)
          .maybeSingle();

        logger.debug('fetchUserRole', 'profiles query result', { profile, profileError });

        const userRole = profile?.user_role as UserRole || 'user';
        logger.debug('fetchUserRole', 'Final userRole determined', { userRole });
        
        if (isMounted) {
          setState({
            userRole,
            isLoading: false,
            error: null,
          });
        }
      } catch (error) {
        logger.error('fetchUserRole', 'Error fetching user role', { error });
        if (isMounted) {
          setState({
            userRole: 'user',
            isLoading: false,
            error: error instanceof Error ? error.message : "Failed to fetch user role",
          });
        }
      }
    };

    fetchUserRole();
    
    return () => {
      isMounted = false;
    };
  }, [user?.id]); // Only depend on user.id to prevent unnecessary re-runs

  const assignRole = async (targetUserId: string, role: UserRole) => {
    if (!user) {
      throw new Error("Must be authenticated to assign roles");
    }

    try {
      // Role assignment is server-authoritative: the assign-role edge function
      // verifies the caller is admin/root_admin, enforces the hierarchy, writes
      // with the service role, and records an audit log. Direct client writes to
      // user_roles are blocked by RLS.
      const { data, error } = await supabase.functions.invoke("assign-role", {
        body: { targetUserId, role },
      });

      if (error) {
        // Surface the structured server error message when present.
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = (await ctx.json().catch(() => null)) as { error?: string } | null;
          if (body?.error) throw new Error(body.error);
        }
        throw error;
      }

      return data;
    } catch (error) {
      if (import.meta.env.DEV) {
        logger.error('assignRole', 'Error assigning role', { error });
      }
      throw error;
    }
  };

  const getAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          user_id,
          first_name,
          last_name,
          email,
          user_role,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('getAllUsers', 'Error fetching all users', { error });
      throw error;
    }
  };

  const hasRole = (role: UserRole): boolean => {
    const roleHierarchy: Record<UserRole, number> = {
      'user': 1,
      'moderator': 2,
      'admin': 3,
      'root_admin': 4,
    };

    return roleHierarchy[state.userRole] >= roleHierarchy[role];
  };

  const isRootAdmin = (): boolean => state.userRole === 'root_admin';
  const isAdmin = (): boolean => hasRole('admin');
  const isModerator = (): boolean => hasRole('moderator');

  const canManageUsers = (): boolean => hasRole('admin');
  const canManageContent = (): boolean => hasRole('moderator');
  const canAccessAdminDashboard = (): boolean => hasRole('moderator');

  // Force refetch function
  const refetch = useCallback(async () => {
    if (user?.id) {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      // Re-trigger the effect by updating a dependency
      // This will be handled by the useEffect above
    }
  }, [user?.id]);

  return {
    ...state,
    assignRole,
    getAllUsers,
    hasRole,
    isRootAdmin,
    isAdmin,
    isModerator,
    canManageUsers,
    canManageContent,
    canAccessAdminDashboard,
    refetch,
  };
}
