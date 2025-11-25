import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, metadata?: any) => Promise<boolean>;
  logout: () => Promise<void>;
  requireAdmin: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cache for admin status
const adminStatusCache = new Map<string, { isAdmin: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;
const pendingChecks = new Map<string, Promise<boolean>>();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
  });

  useEffect(() => {
    console.log('[AuthContext] Initializing...');
    let isMounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      console.log('[AuthContext] Initial session:', !!session, session?.user?.email);
      
      setAuthState({
        user: session?.user || null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
        isAdmin: false,
      });

      if (session?.user) {
        checkIsAdmin(session.user).then((isAdmin) => {
          if (isMounted) {
            console.log('[AuthContext] Initial admin check:', isAdmin);
            setAuthState(prev => ({ ...prev, isAdmin }));
          }
        });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      console.log('[AuthContext] Auth event:', event, session?.user?.email || 'none');
      
      if (event === 'SIGNED_OUT') {
        console.log('[AuthContext] User signed out, clearing state');
        adminStatusCache.clear();
      }
      
      setAuthState({
        user: session?.user || null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
        isAdmin: false,
      });

      if (session?.user) {
        const isAdmin = await checkIsAdmin(session.user);
        console.log('[AuthContext] Admin check result:', isAdmin);
        if (isMounted) {
          setAuthState(prev => ({ ...prev, isAdmin }));
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      console.log('[AuthContext] Cleanup');
    };
  }, []);

  const checkIsAdmin = async (user: User): Promise<boolean> => {
    const cached = adminStatusCache.get(user.id);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.isAdmin;
    }

    const pending = pendingChecks.get(user.id);
    if (pending) return pending;

    const checkPromise = (async () => {
      try {
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (rolesData?.role) {
          const isAdmin = rolesData.role === 'admin' || rolesData.role === 'root_admin';
          adminStatusCache.set(user.id, { isAdmin, timestamp: Date.now() });
          return isAdmin;
        }

        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileData?.user_role) {
          const isAdmin = profileData.user_role === 'admin' || profileData.user_role === 'root_admin';
          adminStatusCache.set(user.id, { isAdmin, timestamp: Date.now() });
          return isAdmin;
        }

        adminStatusCache.set(user.id, { isAdmin: false, timestamp: Date.now() });
        return false;
      } catch (error) {
        console.error("[AuthContext] Admin check error:", error);
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return !!data.session;
    } catch (error) {
      console.error("[AuthContext] Login error:", error);
      return false;
    }
  };

  const signup = async (email: string, password: string, metadata?: any): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: metadata
        }
      });
      if (error) throw error;
      return !!data.user;
    } catch (error) {
      console.error("[AuthContext] Signup error:", error);
      return false;
    }
  };

  const logout = async () => {
    console.log("[AuthContext] Logging out...");
    adminStatusCache.clear();
    
    // Try to call signOut with a timeout
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('signOut timeout after 2s')), 2000)
      );
      
      await Promise.race([
        supabase.auth.signOut(),
        timeoutPromise
      ]);
      console.log("[AuthContext] signOut completed");
    } catch (error: any) {
      console.warn("[AuthContext] signOut failed or timed out:", error.message);
      // Continue with logout anyway
    }
    
    // Manually clear all Supabase storage to ensure complete logout
    try {
      const storageKeys = Object.keys(localStorage).filter(k => k.includes('supabase'));
      console.log("[AuthContext] Clearing localStorage keys:", storageKeys);
      storageKeys.forEach(key => localStorage.removeItem(key));
      console.log("[AuthContext] LocalStorage cleared");
    } catch (error) {
      console.error("[AuthContext] Error clearing localStorage:", error);
    }
    
    // Clear state
    setAuthState({
      user: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
    });
    
    console.log("[AuthContext] Logout complete - state cleared");
  };

  const requireAdmin = () => {
    if (!authState.isAdmin) {
      throw new Error("Admin access required");
    }
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, signup, logout, requireAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

