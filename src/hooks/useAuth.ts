// @ts-nocheck - Temporarily disabled pending database migrations
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
      console.log("checkIsAdmin: No user provided");
      return false;
    }

    // Check cache first
    const cached = adminStatusCache.get(user.id);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log("checkIsAdmin: Using cached result for user:", user.id, "isAdmin:", cached.isAdmin);
      return cached.isAdmin;
    }

    // Check if there's already a pending check for this user
    const pending = pendingChecks.get(user.id);
    if (pending) {
      console.log("checkIsAdmin: Reusing pending check for user:", user.id);
      return pending;
    }

    console.log("checkIsAdmin: Checking admin status for user:", user.id);

    // Create the promise for this check
    const checkPromise = (async () => {
      try {
        // Check user role from user_roles table first
        try {
          const { data, error } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();

          console.log("checkIsAdmin: user_roles query result:", { data, error });

          if (!error && data?.role) {
            const isAdmin = data.role === 'admin' || data.role === 'root_admin';
            console.log("checkIsAdmin: Found role in user_roles:", data.role, "isAdmin:", isAdmin);
            
            // Cache the result
            adminStatusCache.set(user.id, { isAdmin, timestamp: Date.now() });
            
            return isAdmin;
          }
        } catch (error) {
          console.error("Error checking user_roles:", error);
        }

        // Fallback: Check profiles table user_role column
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("user_role")
            .eq("user_id", user.id)
            .maybeSingle();

          console.log("checkIsAdmin: profiles query result:", { data, error });

          if (!error && data?.user_role) {
            const isAdmin = data.user_role === 'admin' || data.user_role === 'root_admin';
            console.log("checkIsAdmin: Found role in profiles:", data.user_role, "isAdmin:", isAdmin);
            
            // Cache the result
            adminStatusCache.set(user.id, { isAdmin, timestamp: Date.now() });
            
            return isAdmin;
          }
        } catch (error) {
          console.error("Error checking profiles:", error);
        }

        console.log("checkIsAdmin: No admin role found, returning false");
        
        // Cache the negative result too
        adminStatusCache.set(user.id, { isAdmin: false, timestamp: Date.now() });
        
        // Security Fix: No email fallback - all admin access must be through database roles
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
