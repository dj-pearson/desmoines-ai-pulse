import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

export type UserRole = 'user' | 'moderator' | 'admin' | 'root_admin';

interface AdminAuthState {
  user: User | null;
  userRole: UserRole;
  isLoading: boolean;
  hasAdminAccess: boolean;
  isRootAdmin: boolean;
}

export function useAdminAuth() {
  const [state, setState] = useState<AdminAuthState>({
    user: null,
    userRole: 'user',
    isLoading: true,
    hasAdminAccess: false,
    isRootAdmin: false,
  });

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user || null;

        if (!user) {
          if (isMounted) {
            setState({
              user: null,
              userRole: 'user',
              isLoading: false,
              hasAdminAccess: false,
              isRootAdmin: false,
            });
          }
          return;
        }

        // Fetch user role
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const userRole = roleData?.role as UserRole || 'user';
        const hasAdminAccess = ['moderator', 'admin', 'root_admin'].includes(userRole);
        const isRootAdmin = userRole === 'root_admin';

        if (isMounted) {
          setState({
            user,
            userRole,
            isLoading: false,
            hasAdminAccess,
            isRootAdmin,
          });
        }
      } catch (error) {
        console.error("Admin auth initialization failed:", error);
        if (isMounted) {
          setState({
            user: null,
            userRole: 'user',
            isLoading: false,
            hasAdminAccess: false,
            isRootAdmin: false,
          });
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        initializeAuth();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}