import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { createLogger } from '@/lib/logger';

const log = createLogger('useAdminAuth');

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

  // Id of the user we last resolved a role for, so a re-emitted SIGNED_IN for
  // the same session doesn't trigger another round of role queries. (WEB-UX-008)
  const resolvedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user || null;

        if (!user) {
          resolvedForUserRef.current = null;
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
        let { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // OAuth User Handling: If no role found, try to sync with existing account by email
        // This handles OAuth users whose email matches an existing account with a role
        if (!roleData?.role && user.email) {
          const { data: syncedRole, error: syncError } = await supabase.rpc(
            'sync_oauth_user_role',
            { p_user_id: user.id }
          );

          if (!syncError && syncedRole && syncedRole !== 'user') {
            roleData = { role: syncedRole };
          }
        }

        const userRole = roleData?.role as UserRole || 'user';
        const hasAdminAccess = ['moderator', 'admin', 'root_admin'].includes(userRole);
        const isRootAdmin = userRole === 'root_admin';

        resolvedForUserRef.current = user.id;

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
        log.error('initializeAuth', 'Admin auth initialization failed', { error });
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

    // Listen for auth changes.
    //
    // SIGNED_IN is re-emitted for the session we already hold every time the
    // browser tab regains visibility (GoTrueClient#_recoverAndRefresh), so only
    // re-resolve the role when the user actually changed — otherwise every tab
    // switch fires a fresh round of role queries and re-renders the admin nav.
    // (WEB-UX-008)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        initializeAuth();
        return;
      }
      if (event === 'SIGNED_IN' && session?.user?.id !== resolvedForUserRef.current) {
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