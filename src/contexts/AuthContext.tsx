import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { SecurityUtils } from "@/lib/security";

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAdminLoading: boolean; // True while admin check is in progress
  requiresMFA: boolean;
  mfaFactorId: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; requiresMFA?: boolean; factorId?: string }>;
  signup: (email: string, password: string, metadata?: any) => Promise<{ success: boolean; error?: string; needsVerification?: boolean }>;
  logout: () => Promise<void>;
  requireAdmin: () => void;
  refreshSession: () => Promise<boolean>;
  signInWithGoogle: (redirectTo?: string) => Promise<{ success: boolean; error?: string }>;
  signInWithApple: (redirectTo?: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  resendVerification: (email: string) => Promise<{ success: boolean; error?: string }>;
  getSessionExpiresAt: () => number | null;
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
    isAdminLoading: false,
    requiresMFA: false,
    mfaFactorId: null,
  });

  // Track if we're in the middle of a logout to prevent race conditions
  const isLoggingOutRef = useRef(false);
  // Track subscription for cleanup
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Check admin status with caching
  const checkIsAdmin = useCallback(async (user: User): Promise<boolean> => {
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
  }, []);

  // Handle auth state changes
  const handleAuthChange = useCallback(async (event: AuthChangeEvent, session: Session | null, isMounted: boolean) => {
    // Skip processing if we're logging out
    if (isLoggingOutRef.current) {
      console.log('[AuthContext] Skipping auth event during logout:', event);
      return;
    }

    if (!isMounted) return;

    console.log('[AuthContext] Auth event:', event, session?.user?.email || 'none');

    // Handle specific events
    if (event === 'SIGNED_OUT') {
      console.log('[AuthContext] User signed out via event');
      adminStatusCache.clear();
      setAuthState({
        user: null,
        session: null,
        isLoading: false,
        isAuthenticated: false,
        isAdmin: false,
        isAdminLoading: false,
        requiresMFA: false,
        mfaFactorId: null,
      });
      return;
    }

    if (event === 'TOKEN_REFRESHED') {
      console.log('[AuthContext] Token refreshed');
      // Just update the session, don't re-check admin
      if (session) {
        setAuthState(prev => ({
          ...prev,
          session,
          user: session.user,
        }));
      }
      return;
    }

    // For SIGNED_IN, INITIAL_SESSION, or USER_UPDATED events
    const needsAdminCheck = session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION');
    setAuthState(prev => ({
      ...prev,
      user: session?.user || null,
      session,
      isLoading: false,
      isAuthenticated: !!session,
      isAdmin: prev.isAdmin, // Keep previous admin status while checking
      isAdminLoading: needsAdminCheck ? true : prev.isAdminLoading, // Mark as loading if checking
    }));

    // Check admin status for new sessions
    if (needsAdminCheck) {
      const isAdmin = await checkIsAdmin(session.user);
      if (isMounted && !isLoggingOutRef.current) {
        console.log('[AuthContext] Admin check result:', isAdmin);
        setAuthState(prev => ({ ...prev, isAdmin, isAdminLoading: false }));
      }
    }
  }, [checkIsAdmin]);

  useEffect(() => {
    console.log('[AuthContext] Initializing...');
    let isMounted = true;

    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[AuthContext] Error getting session:', error);
          if (isMounted) {
            setAuthState(prev => ({ ...prev, isLoading: false }));
          }
          return;
        }

        if (!isMounted) return;
        console.log('[AuthContext] Initial session:', !!session, session?.user?.email);

        setAuthState({
          user: session?.user || null,
          session,
          isLoading: false,
          isAuthenticated: !!session,
          isAdmin: false,
          isAdminLoading: !!session?.user, // Set to true if we have a user to check
          requiresMFA: false,
          mfaFactorId: null,
        });

        if (session?.user) {
          const isAdmin = await checkIsAdmin(session.user);
          if (isMounted) {
            console.log('[AuthContext] Initial admin check:', isAdmin);
            setAuthState(prev => ({ ...prev, isAdmin, isAdminLoading: false }));
          }
        }
      } catch (error) {
        console.error('[AuthContext] Init error:', error);
        if (isMounted) {
          setAuthState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      handleAuthChange(event, session, isMounted);
    });

    subscriptionRef.current = subscription;

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      subscriptionRef.current = null;
      console.log('[AuthContext] Cleanup');
    };
  }, [checkIsAdmin, handleAuthChange]);

  // Login with email/password
  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string; requiresMFA?: boolean; factorId?: string }> => {
    try {
      console.log("[AuthContext] Attempting login for:", email);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.error("[AuthContext] Login error:", error.message);
        return { success: false, error: error.message };
      }

      // Check if MFA is required (AAL1 but user has MFA factors)
      const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const currentLevel = mfaData?.currentLevel;
      const nextLevel = mfaData?.nextLevel;

      // If user has MFA enabled but hasn't verified it yet this session
      if (currentLevel === 'aal1' && nextLevel === 'aal2' && data.session) {
        console.log("[AuthContext] MFA verification required");

        // Get the first verified TOTP factor
        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        const verifiedFactor = factorsData?.totp?.find((f: any) => f.status === 'verified');

        if (verifiedFactor) {
          setAuthState(prev => ({
            ...prev,
            requiresMFA: true,
            mfaFactorId: verifiedFactor.id,
          }));

          return {
            success: false,
            requiresMFA: true,
            factorId: verifiedFactor.id,
          };
        }
      }

      console.log("[AuthContext] Login successful");
      return { success: !!data.session };
    } catch (error: any) {
      console.error("[AuthContext] Login exception:", error);
      return { success: false, error: error.message || "An unexpected error occurred" };
    }
  }, []);

  // Signup with email/password
  const signup = useCallback(async (email: string, password: string, metadata?: any): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      console.log("[AuthContext] Attempting signup for:", email);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/verified`,
          data: metadata
        }
      });

      if (error) {
        console.error("[AuthContext] Signup error:", error.message);
        return { success: false, error: error.message };
      }

      // Check if email confirmation is required
      const needsVerification = data.user && !data.session;
      console.log("[AuthContext] Signup successful, needs verification:", needsVerification);

      return { success: true, needsVerification };
    } catch (error: any) {
      console.error("[AuthContext] Signup exception:", error);
      return { success: false, error: error.message || "An unexpected error occurred" };
    }
  }, []);

  // Logout - robust implementation with race condition prevention
  const logout = useCallback(async () => {
    // Prevent race conditions - set flag before any async operations
    if (isLoggingOutRef.current) {
      console.log("[AuthContext] Logout already in progress, skipping");
      return;
    }

    console.log("[AuthContext] Starting logout...");
    isLoggingOutRef.current = true;

    // Clear admin cache first
    adminStatusCache.clear();
    pendingChecks.clear();

    // Clear state immediately to update UI
    setAuthState({
      user: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      isAdminLoading: false,
      requiresMFA: false,
      mfaFactorId: null,
    });

    // Call signOut with global scope and timeout
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('signOut timeout after 3s')), 3000)
      );

      await Promise.race([
        supabase.auth.signOut({ scope: 'global' }),
        timeoutPromise
      ]);
      console.log("[AuthContext] signOut completed successfully");
    } catch (error: any) {
      console.warn("[AuthContext] signOut failed or timed out:", error.message);
      // Continue with cleanup anyway
    }

    // Clear all Supabase-related localStorage items
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('sb-'))) {
          keysToRemove.push(key);
        }
      }
      console.log("[AuthContext] Clearing localStorage keys:", keysToRemove);
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.error("[AuthContext] Error clearing localStorage:", error);
    }

    // Clear sessionStorage as well
    try {
      const sessionKeysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('sb-'))) {
          sessionKeysToRemove.push(key);
        }
      }
      sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (error) {
      // Ignore sessionStorage errors
    }

    console.log("[AuthContext] Logout complete");

    // Reset the flag after a short delay to allow any pending events to be ignored
    setTimeout(() => {
      isLoggingOutRef.current = false;
    }, 500);
  }, []);

  // Refresh session manually - returns true if successful
  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error("[AuthContext] Session refresh error:", error);
        return false;
      }
      if (data.session) {
        setAuthState(prev => ({
          ...prev,
          session: data.session,
          user: data.session?.user || null,
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error("[AuthContext] Session refresh exception:", error);
      return false;
    }
  }, []);

  // Sign in with Google OAuth
  const signInWithGoogle = useCallback(async (redirectTo?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
      // Validate redirect URL to prevent open redirect attacks
      if (redirectTo && SecurityUtils.isValidRedirectUrl(redirectTo)) {
        callbackUrl.searchParams.set("redirect", redirectTo);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) {
        console.error("[AuthContext] Google sign-in error:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("[AuthContext] Google sign-in exception:", error);
      return { success: false, error: error.message || "Failed to sign in with Google" };
    }
  }, []);

  // Sign in with Apple OAuth
  const signInWithApple = useCallback(async (redirectTo?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
      // Validate redirect URL to prevent open redirect attacks
      if (redirectTo && SecurityUtils.isValidRedirectUrl(redirectTo)) {
        callbackUrl.searchParams.set("redirect", redirectTo);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: callbackUrl.toString(),
        }
      });

      if (error) {
        console.error("[AuthContext] Apple sign-in error:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("[AuthContext] Apple sign-in exception:", error);
      return { success: false, error: error.message || "Failed to sign in with Apple" };
    }
  }, []);

  // Reset password via email
  const resetPassword = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });

      if (error) {
        console.error("[AuthContext] Password reset error:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("[AuthContext] Password reset exception:", error);
      return { success: false, error: error.message || "Failed to send reset email" };
    }
  }, []);

  // Update password (for logged-in users or after reset)
  const updatePassword = useCallback(async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        console.error("[AuthContext] Password update error:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("[AuthContext] Password update exception:", error);
      return { success: false, error: error.message || "Failed to update password" };
    }
  }, []);

  // Resend verification email
  const resendVerification = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (error) {
        console.error("[AuthContext] Resend verification error:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error("[AuthContext] Resend verification exception:", error);
      return { success: false, error: error.message || "Failed to resend verification email" };
    }
  }, []);

  // Get session expiry timestamp (in seconds since epoch)
  const getSessionExpiresAt = useCallback((): number | null => {
    return authState.session?.expires_at || null;
  }, [authState.session]);

  const requireAdmin = useCallback(() => {
    if (!authState.isAdmin) {
      throw new Error("Admin access required");
    }
  }, [authState.isAdmin]);

  return (
    <AuthContext.Provider value={{
      ...authState,
      login,
      signup,
      logout,
      requireAdmin,
      refreshSession,
      signInWithGoogle,
      signInWithApple,
      resetPassword,
      updatePassword,
      resendVerification,
      getSessionExpiresAt,
    }}>
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

