import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { createLogger } from '@/lib/logger';

const log = createLogger('useUserRole');

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
      log.debug("fetchUserRole called", { action: 'fetchUserRole', metadata: { userId: user?.id || 'null' } });

      if (!user) {
        log.debug("No user found, setting default role", { action: 'fetchUserRole' });
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
        log.debug("Checking for user ID", { action: 'fetchUserRole', metadata: { userId: user.id } });

        // Check user_roles table first (authoritative source)
        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        log.debug("user_roles query result", { action: 'fetchUserRole', metadata: { roleData, roleError } });

        if (!roleError && roleData?.role) {
          log.debug("Found role in user_roles", { action: 'fetchUserRole', metadata: { role: roleData.role } });
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

        log.debug("profiles query result", { action: 'fetchUserRole', metadata: { profile, profileError } });

        const userRole = profile?.user_role as UserRole || 'user';
        log.debug("Final userRole determined", { action: 'fetchUserRole', metadata: { userRole } });

        if (isMounted) {
          setState({
            userRole,
            isLoading: false,
            error: null,
          });
        }
      } catch (error) {
        log.error("Error fetching user role", { action: 'fetchUserRole', metadata: { error } });
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
      const { data, error } = await supabase
        .from("user_roles")
        .upsert({
          user_id: targetUserId,
          role,
          assigned_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      log.error("Error assigning role", { action: 'assignRole', metadata: { error } });
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
      log.error("Error fetching all users", { action: 'getAllUsers', metadata: { error } });
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
