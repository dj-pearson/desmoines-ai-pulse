import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
// Only the redirect validator is needed here, and it lives in a file with no
// imports. Reaching it through the SecurityUtils class pulled zod and
// dompurify onto the critical path (WEB-PERF-020).
import { isValidRedirectUrl } from "@/lib/redirectSafety";
import { createLogger } from '@/lib/logger';

const log = createLogger('AuthContext');

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

interface AuthActions {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; requiresMFA?: boolean; factorId?: string }>;
  signup: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<{ success: boolean; error?: string; needsVerification?: boolean }>;
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

type AuthContextType = AuthState & AuthActions;

/**
 * Boolean-only slice of auth state (no `user`/`session` objects). Its identity
 * is stable across TOKEN_REFRESHED ticks — which mutate `session`/`user` but
 * not these flags — so flag-only consumers (Header, BottomNav, gates) don't
 * re-render on every session refresh. (WEB-PERF-005)
 */
export interface AuthFlags {
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAdminLoading: boolean;
  requiresMFA: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AuthStateContext = createContext<AuthState | undefined>(undefined);
const AuthFlagsContext = createContext<AuthFlags | undefined>(undefined);
const AuthActionsContext = createContext<AuthActions | undefined>(undefined);

// Cache for admin status
const adminStatusCache = new Map<string, { isAdmin: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;
const pendingChecks = new Map<string, Promise<boolean>>();

/**
 * Synchronous read of the admin cache. Returns null when there is no fresh
 * entry. Lets a re-emitted auth event resolve admin status without ever
 * entering the `isAdminLoading` state (which unmounts ProtectedRoute
 * subtrees). See handleAuthChange. (WEB-UX-008)
 */
function readCachedAdmin(userId: string): boolean | null {
  const cached = adminStatusCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.isAdmin;
  }
  return null;
}

// Login attempt throttling — max 5 failed attempts per email per 15 minutes
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_EMAIL = 5;
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

function checkLoginThrottle(email: string): { allowed: boolean; retryAfterSec?: number } {
  const key = email.toLowerCase();
  const entry = loginAttempts.get(key);
  if (!entry) return { allowed: true };

  const elapsed = Date.now() - entry.firstAttempt;
  if (elapsed > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS_PER_EMAIL) {
    const retryAfterSec = Math.ceil((LOGIN_WINDOW_MS - elapsed) / 1000);
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true };
}

function recordFailedLogin(email: string) {
  const key = email.toLowerCase();
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() - entry.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: Date.now() });
  } else {
    entry.count++;
    if (entry.count >= MAX_ATTEMPTS_PER_EMAIL) {
      log.warn('login', 'Login throttle triggered', { email: key, attempts: entry.count });
    }
  }
}

function resetLoginAttempts(email: string) {
  loginAttempts.delete(email.toLowerCase());
}

interface ServerLockoutResult {
  allowed: boolean;
  lockoutSeconds?: number;
  attemptsRemaining?: number;
  message?: string;
}

/**
 * Server-side brute-force lockout check (WEB-SEC-006). Authoritative across
 * devices/refreshes. Returns null (treated as allowed) on any failure so an
 * outage never blocks legitimate sign-in.
 */
async function checkServerLockout(
  email: string,
  action: 'check' | 'record_failure' | 'record_success',
): Promise<ServerLockoutResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('check-login-attempt', {
      body: { email, action },
    });
    if (error) return null;
    return data as ServerLockoutResult;
  } catch {
    return null;
  }
}

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
  // Id of the user whose admin status has already been resolved. Used to tell a
  // real sign-in apart from supabase-js re-emitting SIGNED_IN for the session we
  // already hold. (WEB-UX-008 — see handleAuthChange.)
  const resolvedAdminForUserRef = useRef<string | null>(null);

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
        log.error('checkIsAdmin', 'Admin check error', { error });
        return false;
      } finally {
        pendingChecks.delete(user.id);
      }
    })();

    pendingChecks.set(user.id, checkPromise);
    return checkPromise;
  }, []);

  /**
   * Re-check admin status without touching `isAdminLoading`.
   *
   * Used for auth events that concern a user we've already resolved: the role
   * still gets re-validated (a revoked admin loses access), but the UI never
   * enters a loading state, so nothing unmounts. State identity is preserved
   * when the answer hasn't changed, so this is a no-op re-render in the common
   * case. (WEB-UX-008)
   */
  const revalidateAdminSilently = useCallback(async (user: User) => {
    const isAdmin = await checkIsAdmin(user);
    if (isLoggingOutRef.current) return;
    setAuthState(prev => {
      if (prev.user?.id !== user.id || prev.isAdmin === isAdmin) return prev;
      log.debug('revalidateAdminSilently', 'Admin status changed', { isAdmin });
      return { ...prev, isAdmin };
    });
  }, [checkIsAdmin]);

  // Handle auth state changes
  const handleAuthChange = useCallback(async (event: AuthChangeEvent, session: Session | null, isMounted: boolean) => {
    // Skip processing if we're logging out
    if (isLoggingOutRef.current) {
      log.debug('handleAuthChange', 'Skipping auth event during logout', { event });
      return;
    }

    if (!isMounted) return;

    log.debug('handleAuthChange', 'Auth event received', { event, email: session?.user?.email || 'none' });

    // Handle specific events
    if (event === 'SIGNED_OUT') {
      log.info('handleAuthChange', 'User signed out via event');
      adminStatusCache.clear();
      resolvedAdminForUserRef.current = null;
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
      log.debug('handleAuthChange', 'Token refreshed');
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
    const nextUser = session?.user || null;

    // supabase-js re-emits SIGNED_IN for the session we ALREADY hold every time
    // the browser tab regains visibility: its visibilitychange handler calls
    // GoTrueClient#_recoverAndRefresh(), which ends in
    // _notifyAllSubscribers('SIGNED_IN', currentSession). Re-running the admin
    // check on that would flip `isAdminLoading`, and ProtectedRoute swaps its
    // children for a spinner while that flag is set — unmounting the whole page
    // and destroying the open tab, scroll position and any half-filled form.
    // A same-user event is therefore a session refresh, not a sign-in.
    // (WEB-UX-008)
    if (nextUser && resolvedAdminForUserRef.current === nextUser.id) {
      log.debug('handleAuthChange', 'Same-user auth event, refreshing session only', { event });
      setAuthState(prev => {
        // Keep object identity when nothing actually changed so effects keyed on
        // `session`/`user` don't re-run on every tab focus.
        if (prev.isAuthenticated && prev.session?.access_token === session?.access_token) {
          return prev;
        }
        return {
          ...prev,
          user: nextUser,
          session,
          isLoading: false,
          isAuthenticated: true,
        };
      });
      // Still re-validate the role, just without a visible loading state.
      void revalidateAdminSilently(nextUser);
      return;
    }

    // A fresh admin answer already in cache resolves synchronously — no loading
    // state, so a returning user never sees the page blink.
    const cachedAdmin = nextUser ? readCachedAdmin(nextUser.id) : null;
    const needsAdminCheck =
      !!nextUser &&
      cachedAdmin === null &&
      (event === 'SIGNED_IN' || event === 'INITIAL_SESSION');

    setAuthState(prev => ({
      ...prev,
      user: nextUser,
      session,
      isLoading: false,
      isAuthenticated: !!session,
      isAdmin: cachedAdmin ?? prev.isAdmin, // Keep previous admin status while checking
      isAdminLoading: needsAdminCheck ? true : prev.isAdminLoading, // Mark as loading if checking
    }));

    if (nextUser && cachedAdmin !== null) {
      resolvedAdminForUserRef.current = nextUser.id;
    }

    // Check admin status for new sessions
    if (needsAdminCheck) {
      const isAdmin = await checkIsAdmin(nextUser);
      if (isMounted && !isLoggingOutRef.current) {
        log.debug('handleAuthChange', 'Admin check result', { isAdmin });
        resolvedAdminForUserRef.current = nextUser.id;
        setAuthState(prev => ({ ...prev, isAdmin, isAdminLoading: false }));
      }
    }
  }, [checkIsAdmin, revalidateAdminSilently]);

  useEffect(() => {
    log.info('init', 'Initializing auth context');
    let isMounted = true;

    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          log.error('init', 'Error getting session', { error });
          if (isMounted) {
            setAuthState(prev => ({ ...prev, isLoading: false }));
          }
          return;
        }

        if (!isMounted) return;
        log.debug('init', 'Initial session', { hasSession: !!session, email: session?.user?.email });

        const cachedAdmin = session?.user ? readCachedAdmin(session.user.id) : null;

        setAuthState({
          user: session?.user || null,
          session,
          isLoading: false,
          isAuthenticated: !!session,
          isAdmin: cachedAdmin ?? false,
          isAdminLoading: !!session?.user && cachedAdmin === null, // Set to true if we have a user to check
          requiresMFA: false,
          mfaFactorId: null,
        });

        if (session?.user) {
          if (cachedAdmin !== null) {
            resolvedAdminForUserRef.current = session.user.id;
          } else {
            const isAdmin = await checkIsAdmin(session.user);
            if (isMounted) {
              log.debug('init', 'Initial admin check', { isAdmin });
              resolvedAdminForUserRef.current = session.user.id;
              setAuthState(prev => ({ ...prev, isAdmin, isAdminLoading: false }));
            }
          }
        }
      } catch (error) {
        log.error('init', 'Initialization error', { error });
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
      log.debug('cleanup', 'Auth context cleanup');
    };
  }, [checkIsAdmin, handleAuthChange]);

  // Login with email/password (with attempt throttling)
  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string; requiresMFA?: boolean; factorId?: string }> => {
    try {
      // Fast local throttle (defense in depth; bypassable so not authoritative).
      const throttle = checkLoginThrottle(email);
      if (!throttle.allowed) {
        const minutes = Math.ceil((throttle.retryAfterSec || 60) / 60);
        log.warn('login', 'Login throttled', { email, retryAfterSec: throttle.retryAfterSec });
        return { success: false, error: `Too many login attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` };
      }

      // Authoritative SERVER-side brute-force lockout (cross-device, survives
      // refreshes). Fails open if the function is unreachable.
      const serverLock = await checkServerLockout(email, 'check');
      if (serverLock && !serverLock.allowed) {
        log.warn('login', 'Server lockout active', { email });
        return { success: false, error: serverLock.message || 'Too many sign-in attempts. Please try again later.' };
      }

      log.info('login', 'Attempting login', { email });
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        recordFailedLogin(email);
        void checkServerLockout(email, 'record_failure');
        log.error('login', 'Login error', { message: error.message });
        return { success: false, error: error.message };
      }

      // Check if MFA is required (AAL1 but user has MFA factors).
      //
      // WEB-BE-032: both calls below used to discard their errors, and that
      // discard FAILED OPEN. On an error `mfaData` is undefined, so both levels
      // are undefined, the aal1/aal2 condition is false, the whole MFA block is
      // skipped, and execution falls through to "Login successful" — a
      // transient error silently bypassed the MFA prompt. There is no
      // server-side backstop: no RLS policy references aal2, so this branch is
      // the only thing enforcing MFA.
      const { data: mfaData, error: mfaError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (mfaError) {
        log.error('login', 'MFA assurance-level check failed', { message: mfaError.message });
      }
      const currentLevel = mfaData?.currentLevel;
      const nextLevel = mfaData?.nextLevel;

      // Enter the MFA path when the session is aal1 and a second factor exists,
      // OR when the level could not be read at all. The second case is the
      // fail-closed path: unknown means "might need MFA", not "does not".
      if ((currentLevel === 'aal1' && nextLevel === 'aal2' && data.session) || (mfaError && data.session)) {
        log.info('login', 'MFA verification required');

        // Get the first verified TOTP factor
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) {
          // Both MFA reads failed, so whether this account is protected by a
          // second factor is unknown. Refuse the sign-in rather than hand out a
          // session that skipped a gate that may exist. Accounts with no factor
          // are unaffected: listFactors succeeds and simply returns none.
          log.error('login', 'MFA factor lookup failed; refusing sign-in', {
            message: factorsError.message,
          });
          await supabase.auth.signOut();
          return {
            success: false,
            error: 'Could not verify two-factor authentication. Please try again.',
          };
        }
        const verifiedFactor = factorsData?.totp?.find((f) => f.status === 'verified');

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

      resetLoginAttempts(email);
      void checkServerLockout(email, 'record_success');
      log.info('login', 'Login successful');
      return { success: !!data.session };
    } catch (error: unknown) {
      log.error('login', 'Login exception', { error });
      const message = error instanceof Error ? error.message : "An unexpected error occurred";
      return { success: false, error: message };
    }
  }, []);

  // Signup with email/password
  const signup = useCallback(async (email: string, password: string, metadata?: Record<string, unknown>): Promise<{ success: boolean; error?: string; needsVerification?: boolean }> => {
    try {
      log.info('signup', 'Attempting signup', { email });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/verified`,
          data: metadata
        }
      });

      if (error) {
        log.error('signup', 'Signup error', { message: error.message });
        return { success: false, error: error.message };
      }

      // Check if email confirmation is required
      const needsVerification = !!data.user && !data.session;
      log.info('signup', 'Signup successful', { needsVerification });

      return { success: true, needsVerification };
    } catch (error: unknown) {
      log.error('signup', 'Signup exception', { error });
      const message = error instanceof Error ? error.message : "An unexpected error occurred";
      return { success: false, error: message };
    }
  }, []);

  // Logout - robust implementation with race condition prevention
  const logout = useCallback(async () => {
    // Prevent race conditions - set flag before any async operations
    if (isLoggingOutRef.current) {
      log.debug('logout', 'Logout already in progress, skipping');
      return;
    }

    log.info('logout', 'Starting logout');
    isLoggingOutRef.current = true;

    // Clear admin cache first
    adminStatusCache.clear();
    pendingChecks.clear();
    resolvedAdminForUserRef.current = null;

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
      log.info('logout', 'signOut completed successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.warn('logout', 'signOut failed or timed out', { message });
      // Continue with cleanup anyway
    }

    // Clear all Supabase-related localStorage items.
    // INTENTIONAL low-level exception to the @/lib/safeStorage rule
    // (WEB-QUAL-002): this enumerates every key (length/key(i)) to remove only
    // the supabase/sb-* auth keys, which the storage helper interface doesn't
    // support. Both blocks are already guarded against storage-access errors.
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('sb-'))) {
          keysToRemove.push(key);
        }
      }
      log.debug('logout', 'Clearing localStorage keys', { keys: keysToRemove });
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      log.error('logout', 'Error clearing localStorage', { error });
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
      // Intentional: best-effort cleanup on logout. sessionStorage may be
      // unavailable (private mode / disabled storage); failing to clear stale
      // keys here must not block logout, so it is safe to ignore.
    }

    log.info('logout', 'Logout complete');

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
        log.error('refreshSession', 'Session refresh error', { error });
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
      log.error('refreshSession', 'Session refresh exception', { error });
      return false;
    }
  }, []);

  // Sign in with Google OAuth
  const signInWithGoogle = useCallback(async (redirectTo?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
      // Validate redirect URL to prevent open redirect attacks
      if (redirectTo && isValidRedirectUrl(redirectTo)) {
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
        log.error('signInWithGoogle', 'Google sign-in error', { message: error.message });
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: unknown) {
      log.error('signInWithGoogle', 'Google sign-in exception', { error });
      const message = error instanceof Error ? error.message : "Failed to sign in with Google";
      return { success: false, error: message };
    }
  }, []);

  // Sign in with Apple OAuth
  const signInWithApple = useCallback(async (redirectTo?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
      // Validate redirect URL to prevent open redirect attacks
      if (redirectTo && isValidRedirectUrl(redirectTo)) {
        callbackUrl.searchParams.set("redirect", redirectTo);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: callbackUrl.toString(),
        }
      });

      if (error) {
        log.error('signInWithApple', 'Apple sign-in error', { message: error.message });
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: unknown) {
      log.error('signInWithApple', 'Apple sign-in exception', { error });
      const message = error instanceof Error ? error.message : "Failed to sign in with Apple";
      return { success: false, error: message };
    }
  }, []);

  // Reset password via email
  const resetPassword = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });

      if (error) {
        log.error('resetPassword', 'Password reset error', { message: error.message });
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: unknown) {
      log.error('resetPassword', 'Password reset exception', { error });
      const message = error instanceof Error ? error.message : "Failed to send reset email";
      return { success: false, error: message };
    }
  }, []);

  // Update password (for logged-in users or after reset)
  const updatePassword = useCallback(async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        log.error('updatePassword', 'Password update error', { message: error.message });
        return { success: false, error: error.message };
      }

      // Send a transactional security alert to the account email so the
      // account holder knows their password changed even if their session
      // is stolen by an attacker. Fire-and-forget.
      void supabase.functions
        .invoke('send-security-notification', {
          body: {
            event_type: 'password_changed',
            context: {
              user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            },
          },
        })
        .catch((err) => log.warn('updatePassword', 'security alert failed', { error: String(err) }));

      return { success: true };
    } catch (error: unknown) {
      log.error('updatePassword', 'Password update exception', { error });
      const message = error instanceof Error ? error.message : "Failed to update password";
      return { success: false, error: message };
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
        log.error('resendVerification', 'Resend verification error', { message: error.message });
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: unknown) {
      log.error('resendVerification', 'Resend verification exception', { error });
      const message = error instanceof Error ? error.message : "Failed to resend verification email";
      return { success: false, error: message };
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

  const actions = useMemo<AuthActions>(() => ({
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
  }), [login, signup, logout, requireAdmin, refreshSession, signInWithGoogle, signInWithApple, resetPassword, updatePassword, resendVerification, getSessionExpiresAt]);

  // Memoized boolean slice — identity only changes when a flag actually flips,
  // not when session/user are swapped on a token refresh.
  const flags = useMemo<AuthFlags>(() => ({
    isLoading: authState.isLoading,
    isAuthenticated: authState.isAuthenticated,
    isAdmin: authState.isAdmin,
    isAdminLoading: authState.isAdminLoading,
    requiresMFA: authState.requiresMFA,
  }), [
    authState.isLoading,
    authState.isAuthenticated,
    authState.isAdmin,
    authState.isAdminLoading,
    authState.requiresMFA,
  ]);

  const combined = useMemo<AuthContextType>(() => ({
    ...authState,
    ...actions,
  }), [authState, actions]);

  return (
    <AuthContext.Provider value={combined}>
      <AuthStateContext.Provider value={authState}>
        <AuthFlagsContext.Provider value={flags}>
          <AuthActionsContext.Provider value={actions}>
            {children}
          </AuthActionsContext.Provider>
        </AuthFlagsContext.Provider>
      </AuthStateContext.Provider>
    </AuthContext.Provider>
  );
}

/** Read-only auth state — components using this won't re-render when action references change */
export function useAuthState(): AuthState {
  const context = useContext(AuthStateContext);
  if (context === undefined) {
    throw new Error("useAuthState must be used within an AuthProvider");
  }
  return context;
}

/**
 * Boolean auth flags only — consumers won't re-render on token-refresh ticks
 * that only change session/user. Prefer this in hot components (Header,
 * BottomNav, gates) that don't read the user/session objects. (WEB-PERF-005)
 */
export function useAuthFlags(): AuthFlags {
  const context = useContext(AuthFlagsContext);
  if (context === undefined) {
    throw new Error("useAuthFlags must be used within an AuthProvider");
  }
  return context;
}

/** Auth actions only — components using this won't re-render on session/state changes */
export function useAuthActions(): AuthActions {
  const context = useContext(AuthActionsContext);
  if (context === undefined) {
    throw new Error("useAuthActions must be used within an AuthProvider");
  }
  return context;
}

/** Combined auth state + actions (backward compatible) */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

