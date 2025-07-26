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
      console.log("🔍 Getting initial session...");
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("❌ Error getting session:", error);
        setAuthState({
          user: null,
          session: null,
          isLoading: false,
          isAuthenticated: false,
          isAdmin: false,
        });
        return;
      }

      console.log("📋 Session data:", session);
      console.log("👤 User data:", session?.user);

      const isAdmin = await checkIsAdmin(session?.user);
      console.log("🔐 Is admin?", isAdmin);

      setAuthState({
        user: session?.user || null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
        isAdmin,
      });

      console.log("✅ Auth state updated:", {
        isAuthenticated: !!session,
        isAdmin,
        userEmail: session?.user?.email,
      });
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔄 Auth state change event:", event);
      console.log("📋 New session:", session);

      const isAdmin = await checkIsAdmin(session?.user);
      console.log("🔐 Is admin after auth change?", isAdmin);

      setAuthState({
        user: session?.user || null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
        isAdmin,
      });

      console.log("✅ Auth state updated after change:", {
        event,
        isAuthenticated: !!session,
        isAdmin,
        userEmail: session?.user?.email,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkIsAdmin = async (
    user: User | null | undefined
  ): Promise<boolean> => {
    console.log("🔍 Checking admin status for user:", user?.email);

    if (!user) {
      console.log("❌ No user provided");
      return false;
    }

    // Check if user has admin role
    // You can customize this logic based on your admin setup
    // Option 1: Check user metadata
    console.log("📋 User metadata:", user.user_metadata);
    console.log("📋 App metadata:", user.app_metadata);

    if (
      user.user_metadata?.role === "admin" ||
      user.app_metadata?.role === "admin"
    ) {
      console.log("✅ Admin role found in metadata");
      return true;
    }

    // Option 2: Check email domain (for simple setup)
    const adminEmails = [
      "admin@desmoines.ai",
      "admin@desmoinesinsider.com",
      "pearson.performance@gmail.com", // Add your email
      // Add more admin emails as needed
    ];

    console.log("📧 Checking email against admin list:", {
      userEmail: user.email,
      adminEmails,
    });

    if (user.email && adminEmails.includes(user.email)) {
      console.log("✅ Admin email match found");
      return true;
    }

    console.log("❌ No admin access found");
    return false;
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    console.log("🔐 Attempting login with email:", email);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("❌ Login error:", error);
        return false;
      }

      console.log("✅ Login successful, session data:", data.session);
      console.log("👤 User data:", data.session?.user);

      // Check if user has admin access after successful login
      if (data.session?.user) {
        const isAdmin = await checkIsAdmin(data.session.user);
        console.log("🔐 Admin check result:", isAdmin);

        if (!isAdmin) {
          console.log("❌ User does not have admin access, signing out");
          await supabase.auth.signOut();
          console.error("User does not have admin access");
          return false;
        }
      }

      console.log("✅ Login completed successfully");
      return !!data.session;
    } catch (error) {
      console.error("❌ Login failed:", error);
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
