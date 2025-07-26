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
      const isAdmin = await checkIsAdmin(session?.user);

      setAuthState({
        user: session?.user || null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
        isAdmin,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkIsAdmin = async (
    user: User | null | undefined
  ): Promise<boolean> => {
    if (!user) return false;

    // Check if user has admin role
    // You can customize this logic based on your admin setup
    // Option 1: Check user metadata
    if (
      user.user_metadata?.role === "admin" ||
      user.app_metadata?.role === "admin"
    ) {
      return true;
    }

    // Option 2: Check email domain (for simple setup)
    const adminEmails = [
      "admin@desmoines.ai",
      "admin@desmoinesinsider.com",
      // Add more admin emails as needed
    ];

    if (user.email && adminEmails.includes(user.email)) {
      return true;
    }

    // Option 3: Check against a profiles table (if you have one)
    // Uncomment and modify if you have a profiles table with roles
    /*
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      return profile?.role === 'admin';
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
    */

    return false;
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

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
    logout,
    requireAdmin,
  };
}
