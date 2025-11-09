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

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
  });

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("Error getting session:", error);
        setAuthState({
          user: null,
          session: null,
          isLoading: false,
          isAuthenticated: false,
          isAdmin: false,
        });
        return;
      }

      const isAdmin = await checkIsAdmin(session?.user);

      setAuthState({
        user: session?.user || null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
        isAdmin,
      });
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Only synchronous state updates here to prevent deadlock
      setAuthState({
        user: session?.user || null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
        isAdmin: false, // Will be updated after the timeout
      });

      // Defer admin check to prevent Supabase deadlock
      if (session?.user) {
        setTimeout(async () => {
          const isAdmin = await checkIsAdmin(session.user);
          setAuthState(prev => ({
            ...prev,
            isAdmin
          }));
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkIsAdmin = async (
    user: User | null | undefined
  ): Promise<boolean> => {
    if (!user) {
      return false;
    }

    // Check user role from user_roles table
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data?.role) {
        return data.role === 'admin' || data.role === 'root_admin';
      }
    } catch (error) {
      console.error("Error checking admin status:", error);
    }

    // Security Fix: No email fallback - all admin access must be through database roles
    return false;
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
