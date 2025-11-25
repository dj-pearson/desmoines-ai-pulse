import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

// Cache for admin status to prevent excessive database queries
const adminStatusCache = new Map<string, { isAdmin: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Promise cache to prevent simultaneous duplicate calls
const pendingChecks = new Map<string, Promise<boolean>>();

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
  });

  useEffect(() => {
    let isMounted = true;

    // Initialize auth - check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        checkIsAdmin(session?.user).then((isAdmin) => {
          if (isMounted) {
            setAuthState({
              user: session?.user || null,
              session,
              isLoading: false,
              isAuthenticated: !!session,
              isAdmin,
            });
          }
        });
      }
    });

    // Listen for auth changes (handles OAuth redirects, login, logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[Auth] Event: ${event}, User: ${session?.user?.email || 'none'}`);
      
      if (isMounted) {
        const isAdmin = session?.user ? await checkIsAdmin(session.user) : false;
        
        if (isMounted) {
          setAuthState({
            user: session?.user || null,
            session,
            isLoading: false,
            isAuthenticated: !!session,
            isAdmin,
          });
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const checkIsAdmin = async (
    user: User | null | undefined
  ): Promise<boolean> => {
    if (!user) {
      return false;
    }

    // Check cache first
    const cached = adminStatusCache.get(user.id);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.isAdmin;
    }

    // Check if there's already a pending check for this user
    const pending = pendingChecks.get(user.id);
    if (pending) {
      return pending;
    }

    // Create the promise for this check
    const checkPromise = (async () => {
      try {
        // Check user role from user_roles table first
        const { data: rolesData, error: rolesError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!rolesError && rolesData?.role) {
          const isAdmin = rolesData.role === 'admin' || rolesData.role === 'root_admin';
          adminStatusCache.set(user.id, { isAdmin, timestamp: Date.now() });
          return isAdmin;
        }

        // OAuth User Handling: If no role found, try to sync with existing account by email
        if (user.email) {
          try {
            const { data: syncedRole, error: syncError } = await supabase.rpc(
              'sync_oauth_user_role',
              { p_user_id: user.id }
            );

            if (!syncError && syncedRole && syncedRole !== 'user') {
              const isAdmin = syncedRole === 'admin' || syncedRole === 'root_admin';
              adminStatusCache.set(user.id, { isAdmin, timestamp: Date.now() });
              return isAdmin;
            }
          } catch (syncRpcError) {
            // Function might not exist yet - that's OK, continue to fallback
            console.log("[Auth] sync_oauth_user_role not available yet");
          }
        }

        // Fallback: Check profiles table user_role column
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("user_role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!profileError && profileData?.user_role) {
          const isAdmin = profileData.user_role === 'admin' || profileData.user_role === 'root_admin';
          adminStatusCache.set(user.id, { isAdmin, timestamp: Date.now() });
          return isAdmin;
        }

        // Cache the negative result
        adminStatusCache.set(user.id, { isAdmin: false, timestamp: Date.now() });
        return false;
      } catch (error) {
        console.error("[Auth] Error checking admin status:", error);
        return false;
      } finally {
        pendingChecks.delete(user.id);
      }
    })();

    pendingChecks.set(user.id, checkPromise);
    return checkPromise;
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // SECURITY FIX: Check if account is locked before attempting login
      try {
        const { data: lockData, error: lockError } = await supabase.rpc(
          'is_account_locked',
          { p_email: email }
        );

        if (!lockError && lockData === true) {
          throw new Error("Account is temporarily locked. Please try again later.");
        }
      } catch (lockCheckError: any) {
        // If the RPC doesn't exist, that's OK - continue with login
        if (!lockCheckError.message?.includes('temporarily locked')) {
          console.log("[Auth] Account lock check not available");
        } else {
          throw lockCheckError;
        }
      }

      // Attempt login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // Record login attempt (success or failure) - non-blocking
      try {
        const ipAddress = await fetch('https://api.ipify.org?format=json')
          .then(r => r.json())
          .then(d => d.ip)
          .catch(() => 'unknown');

        supabase.rpc('record_login_attempt', {
          p_email: email,
          p_ip_address: ipAddress,
          p_user_agent: navigator.userAgent,
          p_success: !error
        }).catch(() => {
          // Ignore errors in recording - don't block login
        });
      } catch (recordError) {
        // Ignore - don't block login
      }

      if (error) {
        console.error("[Auth] Login error:", error);
        return false;
      }

      // onAuthStateChange will update the state automatically
      return !!data.session;
    } catch (error: any) {
      console.error("[Auth] Login failed:", error);
      throw error;
    }
  };

  const signup = async (email: string, password: string, metadata?: any): Promise<boolean> => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: metadata
        }
      });

      if (error) {
        console.error("[Auth] Signup error:", error);
        return false;
      }

      return !!data.user;
    } catch (error) {
      console.error("[Auth] Signup failed:", error);
      return false;
    }
  };

  const logout = async () => {
    try {
      adminStatusCache.clear();
      await supabase.auth.signOut();
    } catch (error) {
      console.error("[Auth] Logout error:", error);
    }
  };

  const requireAdmin = () => {
    if (!authState.isAdmin) {
      throw new Error("Admin access required");
    }
  };

  return {
    ...authState,
    login,
    signup,
    logout,
    requireAdmin,
  };
}
