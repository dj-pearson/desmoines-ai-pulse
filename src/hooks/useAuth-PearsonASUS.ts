import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { createLogger } from '@/lib/logger';

const log = createLogger('useAuth-PearsonASUS');

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
        log.error("Error getting session", { action: 'getSession', metadata: { error } });
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

    // Check user role from user_roles table - database-driven role checking only
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
      log.error("Error checking admin status", { action: 'checkIsAdmin', metadata: { error } });
    }

    // No fallback - all admin access must be through database roles
    return false;
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        log.error("Login error", { action: 'login', metadata: { error } });

        // Log failed authentication attempt
        try {
          await supabase.from('failed_auth_attempts').insert({
            email: email,
            attempt_type: 'login',
            error_message: error.message,
            user_agent: navigator.userAgent || 'Unknown'
          });
        } catch (logError) {
          log.error("Failed to log authentication attempt", { action: 'login', metadata: { error: logError } });
        }
        
        return false;
      }

      return !!data.session;
    } catch (error) {
      log.error("Login failed", { action: 'login', metadata: { error } });
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
        log.error("Signup error", { action: 'signup', metadata: { error } });

        // Log failed signup attempt
        try {
          await supabase.from('failed_auth_attempts').insert({
            email: email,
            attempt_type: 'signup',
            error_message: error.message,
            user_agent: navigator.userAgent || 'Unknown'
          });
        } catch (logError) {
          log.error("Failed to log signup attempt", { action: 'signup', metadata: { error: logError } });
        }
        
        return false;
      }

      return !!data.user;
    } catch (error) {
      log.error("Signup failed", { action: 'signup', metadata: { error } });
      return false;
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      log.error("Logout error", { action: 'logout', metadata: { error } });
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
