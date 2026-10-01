import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { highestRole, isUserRole } from "@/lib/roles";
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

/** One row of the admin user list, with the role the user actually holds. */
export interface ManagedUser {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  created_at: string;
  /** Strongest user_roles row; profiles.user_role only when there are none. */
  role: UserRole;
}

export const USERS_PAGE_SIZE = 50;

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

        // Every user_roles row, ranked (src/lib/roles.ts). The newest row is
        // not the role: an admin later given a moderator row read as moderator.
        const { data: roleRows, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        logger.debug('fetchUserRole', 'user_roles query result', { roleRows, roleError });

        if (!roleError && roleRows && roleRows.length > 0) {
          if (isMounted) {
            setState({
              userRole: highestRole(roleRows),
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

  /**
   * One page of users with the role each actually holds.
   *
   * This read profiles.user_role, which is the legacy fallback, not the
   * authoritative column: a user granted a role through assign-role (which
   * writes user_roles) still showed as 'user', and changing the dropdown from
   * that wrong starting point was how an admin could be "demoted" without
   * anyone meaning to. It also loaded every profile in one request.
   */
  const getAllUsers = async (
    page = 0,
  ): Promise<{ users: ManagedUser[]; total: number }> => {
    try {
      const from = page * USERS_PAGE_SIZE;
      const { data: profiles, error, count } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, user_role, created_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(from, from + USERS_PAGE_SIZE - 1);

      if (error) throw error;
      const rows = profiles ?? [];
      const ids = rows.map((p) => p.user_id).filter((id): id is string => !!id);

      const rolesByUser = new Map<string, { role: unknown }[]>();
      if (ids.length > 0) {
        const { data: roleRows, error: roleError } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids);
        // A failed read must not show everyone as 'user': the dropdown would
        // then offer an admin the wrong starting point for every row.
        if (roleError) throw roleError;
        for (const r of roleRows ?? []) {
          const list = rolesByUser.get(r.user_id) ?? [];
          list.push({ role: r.role });
          rolesByUser.set(r.user_id, list);
        }
      }

      const users: ManagedUser[] = rows.map((p) => {
        const grants = rolesByUser.get(p.user_id);
        const role: UserRole =
          grants && grants.length > 0
            ? highestRole(grants)
            : isUserRole(p.user_role)
              ? p.user_role
              : "user";
        return {
          user_id: p.user_id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          created_at: p.created_at,
          role,
        };
      });

      return { users, total: count ?? users.length };
    } catch (error) {
      logger.error('getAllUsers', 'Error fetching users', { error });
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
