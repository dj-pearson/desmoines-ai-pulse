import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sessionStartedAt } from "@/lib/sessionAge";
import { supabase } from "@/integrations/supabase/client";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
// Only the redirect validator is needed here, and it lives in a file with no
// imports. Reaching it through the SecurityUtils class pulled zod and
// dompurify onto the critical path (WEB-PERF-020).
import { createLogger } from '@/lib/logger';
import { clearPersonalStorage } from '@/lib/userPreferencesStore';
import { sessionStore } from '@/lib/safeStorage';
import { DEFAULT_ROLE, highestRole, isFullAdmin, isUserRole, type UserRole } from '@/lib/roles';

const log = createLogger('AuthContext');

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /**
   * The strongest role the user holds (WEB-AUTH-010). `isAdmin` is derived
   * from it via isFullAdmin, so the nav and the route guard cannot disagree -
   * they used to, because useAdminAuth resolved the role separately and ranked
   * by created_at instead of by precedence.
   */
  userRole: UserRole;
  isAdminLoading: boolean; // True while admin check is in progress
  requiresMFA: boolean;
  mfaFactorId: string | null;
  /**
   * True between a PASSWORD_RECOVERY event and the password actually changing.
   *
   * WEB-AUTH-001: a recovery link creates an ordinary aal1 session, so every
   * listener sees a normal sign-in and Auth.tsx used to redirect the user to
   * the homepage before they could set a password. This flag is what tells the
   * two apart.
   */
  isPasswordRecovery: boolean;
}

interface AuthActions {
  /**
   * WEB-SEC-029: captchaToken is OPTIONAL at every one of these three call
   * sites, and stays optional. Supabase ignores it until Turnstile is switched
   * on in the dashboard, and the web forms supply it only when
   * VITE_TURNSTILE_SITE_KEY is set - so an existing caller that passes nothing
   * behaves exactly as it did.
   */
  login: (email: string, password: string, captchaToken?: string) => Promise<{ success: boolean; error?: string; errorCode?: string; requiresMFA?: boolean; factorId?: string }>;
  /** `alreadyRegistered` is true when the address already had an account (WEB-AUTH-004). */
  signup: (email: string, password: string, metadata?: Record<string, unknown>, captchaToken?: string) => Promise<{ success: boolean; error?: string; needsVerification?: boolean; alreadyRegistered?: boolean }>;
  /**
   * `scope` defaults to 'global', which is right for a deliberate sign-out.
   * A TIMEOUT must pass 'local' (WEB-AUTH-007): an idle desktop tab signing
   * someone out of their phone is not a security measure, it is a bug that
   * looks like one.
   */
  logout: (options?: { scope?: 'local' | 'global' }) => Promise<void>;
  requireAdmin: () => void;
  refreshSession: () => Promise<boolean>;
  signInWithGoogle: (redirectTo?: string) => Promise<{ success: boolean; error?: string }>;
  signInWithApple: (redirectTo?: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string, captchaToken?: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  /** Starts a double-confirmation email change and alerts the current address (WEB-AUTH-012). */
  updateEmail: (newEmail: string) => Promise<{ success: boolean; error?: string }>;
  /** captchaToken optional for the same reason as login's (WEB-SEC-029). */
  resendVerification: (email: string, captchaToken?: string) => Promise<{ success: boolean; error?: string }>;
  getSessionExpiresAt: () => number | null;
  /** Epoch ms this session began, or null when it cannot be determined (WEB-AUTH-007). */
  getSessionStartedAt: () => number | null;
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
  /** WEB-AUTH-010: the strongest role held; isAdmin is isFullAdmin(userRole). */
  userRole: UserRole;
  isAdminLoading: boolean;
  requiresMFA: boolean;
  isPasswordRecovery: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AuthStateContext = createContext<AuthState | undefined>(undefined);
const AuthFlagsContext = createContext<AuthFlags | undefined>(undefined);
const AuthActionsContext = createContext<AuthActions | undefined>(undefined);

// The resolved role, cached in sessionStorage per user id (WEB-PERF-051).
//
// It was an in-memory Map, so every reload paid for the full role resolution
// again - and for an ordinary user (no user_roles row) that was three sequential
// round trips, one of them the sync_oauth_user_role WRITE. sessionStorage
// survives a reload but not the tab, and sessionStore falls back to memory when
// the store is blocked (private mode), so nothing here can throw.
//
// THIS IS A UI HINT, NOT A GRANT. Anyone can edit sessionStorage, and a
// tampered entry can make the nav and ProtectedRoute render an admin page
// shell. It cannot make any request succeed: user_roles writes are denied to
// clients (20260612000000), admin RLS policies read user_roles through
// is_admin() on the server, and admin edge functions check the caller's JWT
// with isAdminUserId (_shared/apiKeyAuth.ts). That was already true of the
// Map: client-side gating has never been more than a patch to React state
// away, so the cache moving to storage changes the effort, not the exposure.
//
// One key, one user. An entry for a different user id reads as a miss and is
// removed, which is what "clear on user change" means here.
const ROLE_CACHE_KEY = 'auth.roleCache.v1';
// Set once sync_oauth_user_role has been attempted for this user in this tab,
// so the SIGNED_IN that supabase-js re-emits on every tab focus does not write
// again (WEB-PERF-051).
const OAUTH_LINK_KEY = 'auth.oauthRoleLinked.v1';
const CACHE_TTL = 5 * 60 * 1000;
const pendingChecks = new Map<string, Promise<UserRole | null>>();

interface CachedRoleEntry {
  userId: string;
  role: UserRole;
  timestamp: number;
}

function writeCachedRole(userId: string, role: UserRole): void {
  sessionStore.set<CachedRoleEntry>(ROLE_CACHE_KEY, { userId, role, timestamp: Date.now() });
}

/** Drop the role cache and the OAuth-link marker. Sign-out and user change. */
function clearRoleCache(): void {
  sessionStore.remove(ROLE_CACHE_KEY);
  sessionStore.remove(OAUTH_LINK_KEY);
}

/**
 * Synchronous read of the role cache. Returns null when there is no fresh,
 * well-formed entry for this user. Lets a re-emitted auth event resolve admin
 * status without ever entering the `isAdminLoading` state (which unmounts
 * ProtectedRoute subtrees). See handleAuthChange. (WEB-UX-008)
 */
function readCachedRole(userId: string): UserRole | null {
  const cached = sessionStore.get<Partial<CachedRoleEntry>>(ROLE_CACHE_KEY);
  if (!cached) return null;
  if (cached.userId !== userId) {
    // Another account's answer. Never reuse it, and do not leave it around.
    clearRoleCache();
    return null;
  }
  const age = typeof cached.timestamp === 'number' ? Date.now() - cached.timestamp : NaN;
  // A future timestamp is as malformed as a missing one: both would otherwise
  // pin the entry past its TTL.
  if (!isUserRole(cached.role) || !(age >= 0 && age < CACHE_TTL)) {
    sessionStore.remove(ROLE_CACHE_KEY);
    return null;
  }
  return cached.role;
}

function oauthLinkAttempted(userId: string): boolean {
  return sessionStore.getString(OAUTH_LINK_KEY) === userId;
}

/**
 * A user changes when a different id signs in on this tab. Keeps a field-equal
 * user object's identity, so effects keyed on `user` (100-odd hooks) do not
 * re-run on every TOKEN_REFRESHED, which hands back a freshly parsed copy of
 * the same user each hour.
 */
function stableUser(prev: User | null, next: User | null): User | null {
  if (!prev || !next || prev === next || prev.id !== next.id) return next;
  try {
    return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
  } catch {
    return next;
  }
}

/**
 * The user-initiated auth calls live in @/lib/authActions and load on first
 * use (WEB-PERF-063): an anonymous visitor never runs them, and they were a
 * few KB of the entry chunk. A failed chunk load (offline, or a deploy purged
 * the hashed file) returns an ordinary error result, so every caller's
 * existing `success: false` branch handles it.
 */
type AuthActionsModule = typeof import("@/lib/authActions");
const AUTH_ACTIONS_LOAD_ERROR = "Could not reach sign-in. Check your connection and try again.";

async function withAuthActions<R>(scope: string, run: (m: AuthActionsModule) => Promise<R>, onLoadError: R): Promise<R> {
  let mod: AuthActionsModule;
  try {
    mod = await import("@/lib/authActions");
  } catch (error) {
    log.error(scope, 'Could not load auth actions', { error });
    return onLoadError;
  }
  return run(mod);
}

const loadFailure = { success: false, error: AUTH_ACTIONS_LOAD_ERROR } as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  // WEB-SEC-031. AuthProvider is mounted INSIDE QueryClientProvider
  // (main.tsx wraps App), so this resolves.
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
    userRole: DEFAULT_ROLE,
    isAdminLoading: false,
    requiresMFA: false,
    mfaFactorId: null,
    isPasswordRecovery: false,
  });

  // Id of the signed-in user, readable from callbacks whose closures predate
  // the sign-in. Logout needs it to remove that account's scoped preferences
  // (Home plan WP2 item 1) after setAuthState has already nulled the user.
  const currentUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (authState.user?.id) currentUserIdRef.current = authState.user.id;
  }, [authState.user?.id]);

  // Track if we're in the middle of a logout to prevent race conditions
  const isLoggingOutRef = useRef(false);
  // Track subscription for cleanup
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  // Id of the user whose admin status has already been resolved. Used to tell a
  // real sign-in apart from supabase-js re-emitting SIGNED_IN for the session we
  // already hold. (WEB-UX-008 — see handleAuthChange.)
  const resolvedAdminForUserRef = useRef<string | null>(null);

  /**
   * The user's strongest role, cached. Returns null when the read FAILED, which
   * is not the same as `'user'`: callers deny access on either, but only the
   * real answer is cached (WEB-CI-032).
   *
   * `linkOAuth` runs sync_oauth_user_role when no role row matches. Only a
   * SIGNED_IN event asks for it (WEB-PERF-051); it bypasses the cache, because
   * a cached 'user' is exactly the answer the link exists to correct.
   */
  const resolveRole = useCallback(async (
    user: User,
    { linkOAuth = false }: { linkOAuth?: boolean } = {},
  ): Promise<UserRole | null> => {
    if (!linkOAuth) {
      const cached = readCachedRole(user.id);
      if (cached !== null) return cached;
      // A linking check answers this question too, and its answer is better.
      const linking = pendingChecks.get(`${user.id}:link`);
      if (linking) return linking;
    }

    const pendingKey = `${user.id}:${linkOAuth ? 'link' : 'read'}`;
    const pending = pendingChecks.get(pendingKey);
    if (pending) return pending;

    // Marked before the reads, not after the RPC: a user whose role row
    // turns up below never needs the link either, and the marker is what stops
    // the next tab-focus SIGNED_IN from trying again.
    if (linkOAuth) sessionStore.setString(OAUTH_LINK_KEY, user.id);

    const checkPromise = (async () => {
      try {
        // WEB-CI-032: both reads used to discard `error`. supabase-js RESOLVES
        // with an { error } object rather than throwing, so a failed read
        // arrived here as data: null - indistinguishable from "this user holds
        // no admin row" - and that guess was cached for the full TTL. A failure
        // is not an answer, so it is not cached; null is returned (deny) and
        // the next call retries.
        //
        // WEB-AUTH-010: ALL user_roles rows, ranked by precedence. A role row is
        // a grant; holding two means holding both.
        //
        // WEB-PERF-051: the two reads are independent, so they run together.
        // The profile read is wasted when a role row exists; it is one cheap
        // indexed select, against a round trip saved on every miss.
        const [rolesResult, profileResult] = await Promise.all([
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id),
          supabase
            .from("profiles")
            .select("user_role")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);
        const { data: rolesData, error: rolesError } = rolesResult;

        if (rolesError) {
          log.error('resolveRole', 'Role read failed; not caching', { error: rolesError });
          return null;
        }

        if (rolesData && rolesData.length > 0) {
          const role = highestRole(rolesData);
          writeCachedRole(user.id, role);
          return role;
        }

        // OAUTH ROLE LINKING (WEB-AUTH-010).
        //
        // A user who signs in with Google gets a NEW auth user id, so their
        // user_roles rows - keyed by the id of the account they made with a
        // password - do not match. sync_oauth_user_role links them by email
        // and WRITES the role into user_roles, so once it has run the read
        // above finds the row on every later load.
        //
        // That is why it runs only on SIGNED_IN (WEB-PERF-051): it used to run
        // on every INITIAL_SESSION of every user without a role row - most
        // users - making each page load pay for a third sequential call, and a
        // write. Consulted before the profiles fallback, the order useAdminAuth
        // used. An error is ignored rather than fatal: the link is best-effort,
        // and a user with no linkable row is the normal case.
        if (linkOAuth) {
          const { data: syncedRole, error: syncError } = await supabase.rpc(
            'sync_oauth_user_role',
            { p_user_id: user.id },
          );
          if (!syncError && isUserRole(syncedRole) && syncedRole !== DEFAULT_ROLE) {
            writeCachedRole(user.id, syncedRole);
            return syncedRole;
          }
        }

        const { data: profileData, error: profileError } = profileResult;

        if (profileError) {
          log.error('resolveRole', 'Profile role read failed; not caching', { error: profileError });
          return null;
        }

        if (profileData?.user_role) {
          const role = highestRole([{ role: profileData.user_role }]);
          writeCachedRole(user.id, role);
          return role;
        }

        // Both reads succeeded and neither carries a role: a real answer, so
        // it is safe to cache.
        writeCachedRole(user.id, DEFAULT_ROLE);
        return DEFAULT_ROLE;
      } catch (error) {
        log.error('resolveRole', 'Role check error', { error });
        return null;
      } finally {
        pendingChecks.delete(pendingKey);
      }
    })();

    pendingChecks.set(pendingKey, checkPromise);
    return checkPromise;
  }, []);

  // Role resolutions can overlap: on an OAuth redirect, getSession's read-only
  // check and the SIGNED_IN linking check are in flight together, and the
  // read-only one can finish second with the pre-link answer. Each resolution
  // takes a number; only the latest started may write its answer.
  const roleSeqRef = useRef(0);

  /**
   * Write a resolved role into state, unless the user changed or a newer
   * resolution has started since. Always ends the loading state, and keeps
   * state identity when nothing changed.
   */
  const applyRole = useCallback((user: User, role: UserRole | null, seq: number) => {
    const nextRole = role ?? DEFAULT_ROLE;
    const isAdmin = role !== null && isFullAdmin(role);
    setAuthState(prev => {
      if (prev.user?.id !== user.id) return prev;
      if (seq !== roleSeqRef.current) return prev;
      if (prev.isAdmin === isAdmin && prev.userRole === nextRole && !prev.isAdminLoading) return prev;
      log.debug('applyRole', 'Role resolved', { role: nextRole, isAdmin });
      return { ...prev, isAdmin, userRole: nextRole, isAdminLoading: false };
    });
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
  const revalidateAdminSilently = useCallback(async (user: User, options?: { linkOAuth?: boolean }) => {
    const seq = ++roleSeqRef.current;
    const role = await resolveRole(user, options);
    if (isLoggingOutRef.current) return;
    applyRole(user, role, seq);
  }, [resolveRole, applyRole]);

  /**
   * Drop every cached query when a session ends (WEB-SEC-031).
   *
   * Logout removed the sb-* storage keys and nothing else, so the previous
   * user's profile, favorites, subscription, trip plans and -- if they were an
   * admin -- the whole admin surface stayed in the TanStack cache until
   * staleTime expired. On a shared device the next person's first paint could
   * come off that cache.
   *
   * clear(), not removeQueries on a list of user-scoped prefixes. A prefix list
   * is a second inventory that has to be maintained in step with 100-odd hooks,
   * and the failure mode when it drifts is silent and invisible. The cost of
   * clearing everything is that public lists refetch after a logout, which is
   * one request on a screen the user is leaving anyway.
   *
   * Called from BOTH places a session can end, and that is deliberate:
   * handleAuthChange returns early while isLoggingOutRef is set, so the
   * SIGNED_OUT event raised by the logout button never reaches its handler.
   * Putting this only in the event handler would cover expiry and
   * sign-out-elsewhere and miss the button, which is the common case.
   */
  const clearQueryCache = useCallback(() => {
    try {
      queryClient.clear();
    } catch (error) {
      // Never let cache teardown block a sign-out.
      log.warn('clearQueryCache', 'Failed to clear query cache', { error });
    }
  }, [queryClient]);

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
      clearQueryCache();
      clearPersonalStorage(currentUserIdRef.current);
      currentUserIdRef.current = null;
      clearRoleCache();
      pendingChecks.clear();
      resolvedAdminForUserRef.current = null;
      setAuthState({
        user: null,
        session: null,
        isLoading: false,
        isAuthenticated: false,
        isAdmin: false,
        userRole: DEFAULT_ROLE,
        isAdminLoading: false,
        requiresMFA: false,
        mfaFactorId: null,
        isPasswordRecovery: false,
      });
      return;
    }

    // WEB-AUTH-001. Supabase signs the user in on a recovery link and then
    // fires this. Keep the session -- the password change needs it -- but mark
    // it so Auth.tsx sends them to /auth/reset-password instead of the
    // homepage, and so nothing else mistakes it for a deliberate sign-in.
    if (event === 'PASSWORD_RECOVERY') {
      log.debug('handleAuthChange', 'Password recovery session');
      setAuthState(prev => ({
        ...prev,
        user: session?.user ?? prev.user,
        session: session ?? prev.session,
        isLoading: false,
        isAuthenticated: !!session,
        isPasswordRecovery: true,
      }));
      return;
    }

    // The password (or email) has been changed, so the recovery is over. Without
    // this the flag would survive and keep redirecting the user back to the
    // reset page they just finished with.
    if (event === 'USER_UPDATED') {
      setAuthState(prev => ({
        ...prev,
        user: session?.user ?? prev.user,
        session: session ?? prev.session,
        isPasswordRecovery: false,
      }));
      return;
    }

    if (event === 'TOKEN_REFRESHED') {
      log.debug('handleAuthChange', 'Token refreshed');
      // Just update the session, don't re-check admin. The user object is a
      // fresh copy of the same user on every refresh; keeping the old
      // reference when nothing in it changed stops effects keyed on `user`
      // from re-running each hour (WEB-PERF-051).
      if (session) {
        setAuthState(prev => ({
          ...prev,
          session,
          user: stableUser(prev.user, session.user),
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
          user: stableUser(prev.user, nextUser),
          session,
          isLoading: false,
          isAuthenticated: true,
        };
      });
      // Still re-validate the role, just without a visible loading state. A
      // SIGNED_IN for a user not yet linked in this tab carries the OAuth link
      // with it: on an OAuth redirect, getSession can resolve the user (without
      // the link) before supabase-js announces the sign-in. Once attempted,
      // the marker keeps tab-focus re-emits from writing again (WEB-PERF-051).
      const cachedForLink = readCachedRole(nextUser.id);
      void revalidateAdminSilently(nextUser, {
        linkOAuth:
          event === 'SIGNED_IN' &&
          !oauthLinkAttempted(nextUser.id) &&
          (cachedForLink === null || cachedForLink === DEFAULT_ROLE),
      });
      return;
    }

    // WEB-SEC-026. signInWithPassword stores an aal1 session before the TOTP
    // dialog can open, so SIGNED_IN fires, isAuthenticated went true, and
    // Auth.tsx navigated away before the second factor was ever asked for.
    // Anyone holding the password of an MFA-enrolled admin got a working admin
    // session out of it.
    //
    // getAuthenticatorAssuranceLevel() decodes the stored session locally, so
    // this costs no round trip. The rule is narrow on purpose: only a session
    // that is positively aal1 with a positively pending aal2 is held back, so a
    // user with no second factor can never be locked out by it.
    //
    // This is the UX half of the fix. The half that actually stops an attacker
    // is in supabase/functions/_shared/mfaAssurance.ts: the aal1 token works
    // against the API whether or not our app agrees to render a dashboard.
    let mfaPending = false;
    if (session) {
      try {
        // The catch below only fires on a thrown error, and this call resolves
        // with { error } instead, so the failure branch was unreachable. It
        // still fails OPEN deliberately - a user with no second factor must
        // never be locked out by an assurance-level read - but a failure now
        // says so rather than looking like a clean aal2 session.
        const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalError) {
          log.warn('handleAuthChange', 'assurance-level read failed', { error: aalError });
        }
        mfaPending = aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';
      } catch (err) {
        log.warn('handleAuthChange', 'assurance-level read failed', { error: String(err) });
      }
    }

    // A fresh admin answer already in cache resolves synchronously — no loading
    // state, so a returning user never sees the page blink.
    const cachedRole = nextUser ? readCachedRole(nextUser.id) : null;
    // WEB-PERF-051: sync_oauth_user_role runs on SIGNED_IN only, never on
    // INITIAL_SESSION or TOKEN_REFRESHED, and at most once per user per tab. A
    // cached role other than 'user' already came from a role row, which the
    // link would only echo back.
    const linkOAuth =
      !!nextUser &&
      event === 'SIGNED_IN' &&
      !oauthLinkAttempted(nextUser.id) &&
      (cachedRole === null || cachedRole === DEFAULT_ROLE);
    const needsAdminCheck =
      !!nextUser &&
      (cachedRole === null || linkOAuth) &&
      (event === 'SIGNED_IN' || event === 'INITIAL_SESSION');

    setAuthState(prev => ({
      ...prev,
      user: nextUser,
      session,
      isLoading: false,
      // WEB-SEC-026: a session that still owes a second factor is not signed in.
      isAuthenticated: !!session && !mfaPending,
      requiresMFA: mfaPending,
      // Keep the previous answer while checking.
      isAdmin: cachedRole !== null ? isFullAdmin(cachedRole) : prev.isAdmin,
      userRole: cachedRole ?? prev.userRole,
      isAdminLoading: needsAdminCheck ? true : prev.isAdminLoading, // Mark as loading if checking
    }));

    if (nextUser && cachedRole !== null) {
      resolvedAdminForUserRef.current = nextUser.id;
    }

    // Check admin status for new sessions
    if (needsAdminCheck) {
      const seq = ++roleSeqRef.current;
      const role = await resolveRole(nextUser, { linkOAuth });
      if (isMounted && !isLoggingOutRef.current) {
        log.debug('handleAuthChange', 'Role check result', { role });
        resolvedAdminForUserRef.current = nextUser.id;
        applyRole(nextUser, role, seq);
      }
    }
  }, [resolveRole, revalidateAdminSilently, clearQueryCache, applyRole]);

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

        const cachedRole = session?.user ? readCachedRole(session.user.id) : null;

        setAuthState(prev => ({
          user: session?.user || null,
          session,
          isLoading: false,
          isAuthenticated: !!session,
          isAdmin: cachedRole !== null && isFullAdmin(cachedRole),
          userRole: cachedRole ?? DEFAULT_ROLE,
          isAdminLoading: !!session?.user && cachedRole === null, // Set to true if we have a user to check
          requiresMFA: false,
          mfaFactorId: null,
          // PASSWORD_RECOVERY and INITIAL_SESSION can arrive in either order on
          // a recovery link, so this must not clobber the flag.
          isPasswordRecovery: prev.isPasswordRecovery,
        }));

        if (session?.user) {
          if (cachedRole !== null) {
            resolvedAdminForUserRef.current = session.user.id;
          } else {
            // Read-only: the OAuth link is a SIGNED_IN concern (WEB-PERF-051).
            const seq = ++roleSeqRef.current;
            const role = await resolveRole(session.user);
            if (isMounted) {
              log.debug('init', 'Initial role check', { role });
              resolvedAdminForUserRef.current = session.user.id;
              applyRole(session.user, role, seq);
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
  }, [resolveRole, handleAuthChange, applyRole]);

  // Login with email/password (throttle, server lockout and MFA gate in authActions)
  const login = useCallback(async (email: string, password: string, captchaToken?: string): Promise<{ success: boolean; error?: string; errorCode?: string; requiresMFA?: boolean; factorId?: string }> => {
    const result = await withAuthActions('login', (m) => m.loginWithPassword(email, password, captchaToken), { ...loadFailure });
    if (result.requiresMFA && result.factorId) {
      const factorId = result.factorId;
      setAuthState(prev => ({ ...prev, requiresMFA: true, mfaFactorId: factorId }));
    }
    return result;
  }, []);

  // Signup with email/password
  const signup = useCallback(async (email: string, password: string, metadata?: Record<string, unknown>, captchaToken?: string): Promise<{ success: boolean; error?: string; needsVerification?: boolean; alreadyRegistered?: boolean }> => {
    return withAuthActions('signup', (m) => m.signUpWithPassword(email, password, metadata, captchaToken), { ...loadFailure });
  }, []);

  // Logout - robust implementation with race condition prevention
  const logout = useCallback(async (options?: { scope?: 'local' | 'global' }) => {
    // Prevent race conditions - set flag before any async operations
    if (isLoggingOutRef.current) {
      log.debug('logout', 'Logout already in progress, skipping');
      return;
    }

    log.info('logout', 'Starting logout');
    isLoggingOutRef.current = true;

    // Before the await below, not after: signOut can time out (there is a 3s
    // race here) and the cached rows must be gone either way.
    clearQueryCache();
    // Same reasoning for what the account left in local storage: its taste
    // preferences and the recently viewed list. Without this the next person
    // to sign in on this browser inherited both (Home plan WP2 item 1).
    clearPersonalStorage(currentUserIdRef.current);
    currentUserIdRef.current = null;

    // Clear the role cache first (sessionStorage, so it would otherwise
    // outlive the sign-out for the rest of the tab).
    clearRoleCache();
    pendingChecks.clear();
    resolvedAdminForUserRef.current = null;

    // Clear state immediately to update UI
    setAuthState({
      user: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      userRole: DEFAULT_ROLE,
      isAdminLoading: false,
      requiresMFA: false,
      mfaFactorId: null,
      isPasswordRecovery: false,
    });

    // Call signOut with global scope and timeout
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('signOut timeout after 3s')), 3000)
      );

      await Promise.race([
        // WEB-AUTH-007. 'global' revokes every refresh token the account holds,
        // on every device. Correct when a person presses Log Out; wrong when a
        // desktop tab has simply been idle, which used to sign them out of
        // their phone too.
        supabase.auth.signOut({ scope: options?.scope ?? 'global' }),
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
  }, [clearQueryCache]);

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

  const signInWithGoogle = useCallback(async (redirectTo?: string): Promise<{ success: boolean; error?: string }> => {
    return withAuthActions('signInWithGoogle', (m) => m.signInWithOAuthProvider('google', redirectTo), { ...loadFailure });
  }, []);

  const signInWithApple = useCallback(async (redirectTo?: string): Promise<{ success: boolean; error?: string }> => {
    return withAuthActions('signInWithApple', (m) => m.signInWithOAuthProvider('apple', redirectTo), { ...loadFailure });
  }, []);

  const resetPassword = useCallback(async (email: string, captchaToken?: string): Promise<{ success: boolean; error?: string }> => {
    return withAuthActions('resetPassword', (m) => m.sendPasswordReset(email, captchaToken), { ...loadFailure });
  }, []);

  // Update password (for logged-in users or after reset); alerts the account email.
  const updatePassword = useCallback(async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    return withAuthActions('updatePassword', (m) => m.changePassword(newPassword), { ...loadFailure });
  }, []);

  // Double-confirmation email change; alerts the current address (WEB-AUTH-012).
  const updateEmail = useCallback(async (newEmail: string): Promise<{ success: boolean; error?: string }> => {
    return withAuthActions('updateEmail', (m) => m.changeEmail(newEmail), { ...loadFailure });
  }, []);

  const resendVerification = useCallback(async (email: string, captchaToken?: string): Promise<{ success: boolean; error?: string }> => {
    return withAuthActions('resendVerification', (m) => m.resendSignupVerification(email, captchaToken), { ...loadFailure });
  }, []);

  // Get session expiry timestamp (in seconds since epoch)
  const getSessionExpiresAt = useCallback((): number | null => {
    return authState.session?.expires_at || null;
  }, [authState.session]);

  /**
   * When this session actually began, in epoch milliseconds (WEB-AUTH-007).
   *
   * Null when it cannot be told, and callers must handle that rather than
   * substituting now(): doing so silently restores the page-load-relative
   * measurement this replaces.
   */
  const getSessionStartedAt = useCallback((): number | null => {
    return sessionStartedAt(authState.session);
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
    updateEmail,
    resendVerification,
    getSessionExpiresAt,
    getSessionStartedAt,
  }), [login, signup, logout, requireAdmin, refreshSession, signInWithGoogle, signInWithApple, resetPassword, updatePassword, updateEmail, resendVerification, getSessionExpiresAt, getSessionStartedAt]);

  // Memoized boolean slice — identity only changes when a flag actually flips,
  // not when session/user are swapped on a token refresh.
  const flags = useMemo<AuthFlags>(() => ({
    isLoading: authState.isLoading,
    isAuthenticated: authState.isAuthenticated,
    isAdmin: authState.isAdmin,
    userRole: authState.userRole,
    isAdminLoading: authState.isAdminLoading,
    requiresMFA: authState.requiresMFA,
    isPasswordRecovery: authState.isPasswordRecovery,
  }), [
    authState.isLoading,
    authState.isAuthenticated,
    authState.isAdmin,
    authState.userRole,
    authState.isAdminLoading,
    authState.requiresMFA,
    authState.isPasswordRecovery,
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

/**
 * Combined auth state + actions (backward compatible).
 *
 * THIS RE-RENDERS ON EVERY TOKEN REFRESH, and that is the whole reason the three
 * hooks above exist. `combined` is memoized on [authState, actions], and
 * authState carries `session` and `user` - objects Supabase swaps on each
 * refresh tick - so its identity changes even when nothing a component reads
 * changed (WEB-PERF-005).
 *
 * It is kept, unchanged, so the split needed zero call-site churn: 108 files
 * still use it and are meant to. But a component in a hot path - anything
 * rendered on every route, inside a list, or above a large tree - should reach
 * for the narrower hook instead:
 *
 *   useAuthFlags()    isAuthenticated / isAdmin / isLoading / requiresMFA only.
 *                     Identity changes only when a boolean flips, which is why
 *                     Header and BottomNav stopped re-rendering on refresh ticks.
 *   useAuthState()    the full state object, without the action identities.
 *   useAuthActions()  login / logout / etc. Stable across state changes.
 *
 * `useAuth` is the obvious name, so it is what a new component reaches for by
 * default and it will silently forfeit the benefit. Current adoption: 4 files on
 * useAuthFlags, 2 on useAuthState, 2 on useAuthActions.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

