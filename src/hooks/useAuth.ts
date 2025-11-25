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

    // Helper to update auth state safely
    const updateAuthState = async (session: Session | null, eventName?: string) => {
      if (!isMounted) return;
      
      console.log(`[Auth] ${eventName || 'update'}: session=${!!session}, user=${session?.user?.email || 'none'}`);
      
      try {
        const isAdmin = session?.user ? await checkIsAdmin(session.user) : false;
        
        if (!isMounted) return;
        
        console.log(`[Auth] Setting state: authenticated=${!!session}, isAdmin=${isAdmin}`);
        setAuthState({
          user: session?.user || null,
          session,
          isLoading: false,
          isAuthenticated: !!session,
          isAdmin,
        });
      } catch (error) {
        console.error("[Auth] Error in updateAuthState:", error);
        if (isMounted) {
          setAuthState({
            user: session?.user || null,
            session,
            isLoading: false,
            isAuthenticated: !!session,
            isAdmin: false,
          });
        }
      }
    };

    // Set up auth state change listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[Auth] onAuthStateChange fired: event=${event}, hasSession=${!!session}`);
      await updateAuthState(session, event);
    });

    // Then get initial session
    const getInitialSession = async () => {
      try {
        // Log the current URL for debugging OAuth redirects
        console.log(`[Auth] Init: URL=${window.location.href}`);
        
        // CRITICAL: Check if there are OAuth tokens in the URL hash
        // If so, wait for onAuthStateChange to handle them, don't call getSession yet
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const hasOAuthTokens = hashParams.has('access_token') || hashParams.has('error');
        
        if (hasOAuthTokens) {
          console.log('[Auth] OAuth tokens detected in URL hash - waiting for onAuthStateChange to process them...');
          // Don't call getSession - let the Supabase client process the tokens
          // and trigger the onAuthStateChange event
          return;
        }
        
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("[Auth] getSession error:", error);
          if (isMounted) {
            setAuthState({
              user: null,
              session: null,
              isLoading: false,
              isAuthenticated: false,
              isAdmin: false,
            });
          }
          return;
        }

        console.log(`[Auth] getSession: hasSession=${!!session}`);
        await updateAuthState(session, 'getInitialSession');
      } catch (error) {
        console.error("[Auth] Init error:", error);
        if (isMounted) {
          setAuthState({
            user: null,
            session: null,
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
          });
        }
      }
    };

    getInitialSession();

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
        // This handles the case where user signed up with email/password and later uses OAuth
        if (user.email) {
          const { data: syncedRole, error: syncError } = await supabase.rpc(
            'sync_oauth_user_role',
            { p_user_id: user.id }
          );

          if (!syncError && syncedRole && syncedRole !== 'user') {
            const isAdmin = syncedRole === 'admin' || syncedRole === 'root_admin';
            adminStatusCache.set(user.id, { isAdmin, timestamp: Date.now() });
            return isAdmin;
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
        console.error("Error checking admin status:", error);
        // Don't cache errors - allow retry on next check
        return false;
      } finally {
        // Remove from pending checks when done
        pendingChecks.delete(user.id);
      }
    })();

    // Store the promise in pending checks
    pendingChecks.set(user.id, checkPromise);

    return checkPromise;
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // SECURITY FIX: Check if account is locked before attempting login
      const { data: lockData, error: lockError } = await supabase.rpc(
        'is_account_locked',
        { p_email: email }
      );

      if (lockError) {
        console.error("Account lockout check failed:", lockError);
      } else if (lockData === true) {
        console.warn("Account is locked due to too many failed attempts");
        throw new Error("Account is temporarily locked. Please try again later.");
      }

      // Attempt login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // Record login attempt (success or failure)
      try {
        const ipAddress = await fetch('https://api.ipify.org?format=json')
          .then(r => r.json())
          .then(d => d.ip)
          .catch(() => 'unknown');

        await supabase.rpc('record_login_attempt', {
          p_email: email,
          p_ip_address: ipAddress,
          p_user_agent: navigator.userAgent,
          p_success: !error
        });
      } catch (recordError) {
        console.error("Failed to record login attempt:", recordError);
      }

      if (error) {
        console.error("Login error:", error);
        return false;
      }

      return !!data.session;
    } catch (error) {
      console.error("Login failed:", error);
      return false;
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
        console.error("Signup error:", error);
        return false;
      }

      return !!data.user;
    } catch (error) {
      console.error("Signup failed:", error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
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
