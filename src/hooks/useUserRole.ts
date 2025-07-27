import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

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

export function useUserRole() {
  const { user } = useAuth();
  const [state, setState] = useState<RoleState>({
    userRole: 'user',
    isLoading: true,
    error: null,
  });

  const fetchUserRole = async () => {
    if (!user) {
      setState({ userRole: 'user', isLoading: false, error: null });
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      console.log("fetchUserRole: checking for user ID:", user.id);

      // Check user_roles table first (authoritative source)
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log("user_roles query result:", { roleData, roleError });

      if (!roleError && roleData?.role) {
        console.log("Found role in user_roles:", roleData.role);
        setState({
          userRole: roleData.role as UserRole,
          isLoading: false,
          error: null,
        });
        return;
      }

      // Fallback to profiles table if no role found in user_roles
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_role")
        .eq("user_id", user.id)
        .maybeSingle();

      console.log("profiles query result:", { profile, profileError });

      const userRole = profile?.user_role as UserRole || 'user';
      console.log("Final userRole determined:", userRole);
      
      setState({
        userRole,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error("Error fetching user role:", error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to fetch user role",
      }));
    }
  };

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
      console.error("Error assigning role:", error);
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
      console.error("Error fetching all users:", error);
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

  useEffect(() => {
    fetchUserRole();
  }, [user]);

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
    refetch: fetchUserRole,
  };
}