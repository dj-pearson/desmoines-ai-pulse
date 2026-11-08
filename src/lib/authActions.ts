import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import { interpretSignUpResult } from '@/lib/signUpResult';
import { isValidRedirectUrl } from '@/lib/redirectSafety';

/**
 * The user-initiated Supabase auth calls: sign in, sign up, OAuth, password
 * reset and change, email change, resend verification (WEB-PERF-063).
 *
 * They used to live inside AuthProvider, which is in the entry chunk, so every
 * anonymous visitor downloaded the login throttle, the MFA gate and seven
 * error-handling bodies they would never run. AuthContext now reaches this
 * module with a dynamic import when one of these actions is actually called.
 * Nothing here touches React state: the one piece of state a sign-in sets
 * (requiresMFA/mfaFactorId) is set by the provider from the returned result.
 *
 * Keep this module out of the static graph from main.tsx; that is what
 * src/__tests__/entryChunkAuthActions.test.ts pins.
 */

// Same logger name as before the split, so log lines did not change.
const log = createLogger('AuthContext');

export interface LoginResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  requiresMFA?: boolean;
  factorId?: string;
}

export interface SignUpResult {
  success: boolean;
  error?: string;
  needsVerification?: boolean;
  alreadyRegistered?: boolean;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

// Login attempt throttling: max 5 failed attempts per email per 15 minutes.
// Module state, as it was when it lived in AuthContext: it lasts for the tab.
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
  // WEB-SEC-027: clearing a lockout requires proof that the sign-in actually
  // succeeded. The server verifies this token against GoTrue and checks the
  // address on it; a call without one is accepted and changes nothing.
  accessToken?: string,
): Promise<ServerLockoutResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('check-login-attempt', {
      body: accessToken ? { email, action, accessToken } : { email, action },
    });
    if (error) return null;
    return data as ServerLockoutResult;
  } catch {
    return null;
  }
}

/**
 * Where a sign-up confirmation link sends the person (WEB-AUTH-005): through
 * /auth/callback, which waits for the session and renders a failed link, and
 * on to /auth/verified. Used by signup and by resend so the two cannot differ.
 */
function confirmationRedirectUrl(): string {
  return `${window.location.origin}/auth/callback?redirect=${encodeURIComponent('/auth/verified')}`;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Email/password sign-in with the local throttle, the server lockout and the MFA gate. */
export async function loginWithPassword(email: string, password: string, captchaToken?: string): Promise<LoginResult> {
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });

    if (error) {
      recordFailedLogin(email);
      void checkServerLockout(email, 'record_failure');
      log.error('login', 'Login error', { message: error.message, code: error.code });
      // WEB-AUTH-008: the CODE travels with the message, so the form can offer
      // "resend confirmation" on email_not_confirmed without matching on
      // Supabase's wording. `error` is unchanged for callers that read it.
      return { success: false, error: error.message, errorCode: error.code };
    }

    // WEB-BE-032: both MFA reads must fail CLOSED. On an error `mfaData` is
    // undefined, and the old code skipped the whole MFA block, so a transient
    // error silently bypassed the second factor. No RLS policy references
    // aal2, so this branch is the only thing enforcing MFA.
    const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError) {
      log.error('login', 'MFA assurance-level check failed', { message: mfaError.message });
    }
    const currentLevel = mfaData?.currentLevel;
    const nextLevel = mfaData?.nextLevel;

    // Enter the MFA path when the session is aal1 and a second factor exists,
    // OR when the level could not be read at all ("might need MFA").
    if ((currentLevel === 'aal1' && nextLevel === 'aal2' && data.session) || (mfaError && data.session)) {
      log.info('login', 'MFA verification required');

      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        // Both MFA reads failed, so whether this account has a second factor
        // is unknown. Refuse rather than hand out a session that skipped a
        // gate that may exist. Accounts with no factor are unaffected:
        // listFactors succeeds and simply returns none.
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
        // The provider sets requiresMFA/mfaFactorId from this result.
        return { success: false, requiresMFA: true, factorId: verifiedFactor.id };
      }
    }

    resetLoginAttempts(email);
    // WEB-SEC-027: the server clears a lockout only against a session that a
    // correct password produced, so the token goes with the call.
    void checkServerLockout(email, 'record_success', data.session?.access_token);
    log.info('login', 'Login successful');
    return { success: !!data.session };
  } catch (error: unknown) {
    log.error('login', 'Login exception', { error });
    return { success: false, error: messageOf(error, 'An unexpected error occurred') };
  }
}

export async function signUpWithPassword(
  email: string,
  password: string,
  metadata?: Record<string, unknown>,
  captchaToken?: string,
): Promise<SignUpResult> {
  try {
    log.info('signup', 'Attempting signup', { email });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        // WEB-AUTH-005: through /auth/callback, which can exchange the code,
        // wait for the session and explain a failed link, then on to
        // /auth/verified.
        emailRedirectTo: confirmationRedirectUrl(),
        data: metadata,
      },
    });

    if (error) {
      log.error('signup', 'Signup error', { message: error.message });
      return { success: false, error: error.message };
    }

    // WEB-AUTH-004: Supabase answers a new account and an existing address
    // the same way on purpose; the tell is an empty `identities` array.
    const { needsVerification, alreadyRegistered } = interpretSignUpResult(data);
    // The email is NOT logged here: "already registered" plus an address is
    // the pairing the neutral response exists to withhold.
    log.info('signup', 'Signup successful', { needsVerification, alreadyRegistered });

    return { success: true, needsVerification, alreadyRegistered };
  } catch (error: unknown) {
    log.error('signup', 'Signup exception', { error });
    return { success: false, error: messageOf(error, 'An unexpected error occurred') };
  }
}

export async function signInWithOAuthProvider(provider: 'google' | 'apple', redirectTo?: string): Promise<ActionResult> {
  const name = provider === 'google' ? 'Google' : 'Apple';
  const scope = provider === 'google' ? 'signInWithGoogle' : 'signInWithApple';
  try {
    const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
    // Validate redirect URL to prevent open redirect attacks
    if (redirectTo && isValidRedirectUrl(redirectTo)) {
      callbackUrl.searchParams.set('redirect', redirectTo);
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options:
        provider === 'google'
          ? { redirectTo: callbackUrl.toString(), queryParams: { access_type: 'offline', prompt: 'consent' } }
          : { redirectTo: callbackUrl.toString() },
    });

    if (error) {
      log.error(scope, `${name} sign-in error`, { message: error.message });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: unknown) {
    log.error(scope, `${name} sign-in exception`, { error });
    return { success: false, error: messageOf(error, `Failed to sign in with ${name}`) };
  }
}

export async function sendPasswordReset(email: string, captchaToken?: string): Promise<ActionResult> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      captchaToken,
      // WEB-AUTH-001. OWNER: this URL must also be on the Supabase redirect
      // allowlist (Dashboard -> Authentication -> URL Configuration), or
      // GoTrue falls back to the site URL and the reset page never sees the
      // token.
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      log.error('resetPassword', 'Password reset error', { message: error.message });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: unknown) {
    log.error('resetPassword', 'Password reset exception', { error });
    return { success: false, error: messageOf(error, 'Failed to send reset email') };
  }
}

export async function changePassword(newPassword: string): Promise<ActionResult> {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      log.error('updatePassword', 'Password update error', { message: error.message });
      return { success: false, error: error.message };
    }

    // The account holder hears about the change even if the session that made
    // it was stolen.
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
    return { success: false, error: messageOf(error, 'Failed to update password') };
  }
}

/**
 * WEB-AUTH-012. Supabase's default double confirmation (a link to the current
 * address and to the new one) is what makes this safe against a hijacked
 * session; the alert goes to the CURRENT address.
 */
export async function changeEmail(newEmail: string): Promise<ActionResult> {
  try {
    const { error } = await supabase.auth.updateUser({ email: newEmail });

    if (error) {
      log.error('updateEmail', 'Email update error', { message: error.message });
      return { success: false, error: error.message };
    }

    void supabase.functions
      .invoke('send-security-notification', {
        body: {
          event_type: 'email_change_requested',
          context: {
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          },
        },
      })
      .catch((err) => log.warn('updateEmail', 'security alert failed', { error: String(err) }));
    return { success: true };
  } catch (error: unknown) {
    log.error('updateEmail', 'Email update exception', { error });
    return { success: false, error: messageOf(error, 'Failed to update email') };
  }
}

export async function resendSignupVerification(email: string, captchaToken?: string): Promise<ActionResult> {
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      // Same redirect as signup's, from the same function, so a resent link
      // also goes through /auth/callback.
      options: { emailRedirectTo: confirmationRedirectUrl(), captchaToken },
    });

    if (error) {
      log.error('resendVerification', 'Resend verification error', { message: error.message });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: unknown) {
    log.error('resendVerification', 'Resend verification exception', { error });
    return { success: false, error: messageOf(error, 'Failed to resend verification email') };
  }
}
