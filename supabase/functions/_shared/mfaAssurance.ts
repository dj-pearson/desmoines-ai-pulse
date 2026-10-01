/**
 * MFA assurance for admin actions (WEB-SEC-026).
 *
 * THE CLIENT GATE WAS NEVER A SECURITY CONTROL. AuthContext refuses to treat an
 * aal1 session as signed in when a second factor is pending, which is correct
 * and is worth having, but it protects only people who use our React app. An
 * attacker holding an admin's password does not have to: GoTrue hands out the
 * aal1 access token directly, and that token is accepted by PostgREST and by
 * every edge function. So the browser check is UX; this file is the control.
 *
 * WHAT "ASSURANCE" MEANS HERE
 *   aal1  the session proved one factor (a password)
 *   aal2  the session also proved a second factor (TOTP)
 * A user who has enrolled and verified a TOTP factor and is presenting an aal1
 * token has not finished signing in. For an admin endpoint that is a refusal.
 *
 * A user with NO verified factor is unaffected, at any level. That is what
 * makes this additive under CLAUDE.md: no shipped iOS or Android binary can
 * lose access, because neither performs an admin action and neither can enrol
 * a factor in the first place.
 *
 * WHY THE FACTOR LIST COMES FROM THE USER OBJECT: GoTrue returns `factors` on
 * GET /user, which securityLayers already calls to authenticate the request. No
 * extra round trip, no service-role client, and no read of auth.mfa_factors.
 */

/** Shape of the pieces of the GoTrue user object this module needs. */
export interface UserWithFactors {
  factors?: Array<{ status?: string | null } | null> | null;
}

/** Assurance level claimed by an access token. */
export type AssuranceLevel = 'aal1' | 'aal2';

/**
 * The `aal` claim of a JWT, without verifying the signature.
 *
 * Reading an unverified claim is safe HERE and only here: the caller has
 * already passed the token to `auth.getUser()`, which does verify it against
 * GoTrue. This function is parsing a token that has been authenticated, not
 * deciding whether to trust one.
 *
 * Returns null when the token is malformed, which callers must treat as "not
 * aal2" rather than as "no opinion".
 */
export function readAalClaim(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // base64url -> base64, then pad. atob rejects the url-safe alphabet.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as Record<string, unknown>;
    const aal = claims.aal;
    return typeof aal === 'string' ? aal : null;
  } catch {
    return null;
  }
}

/** Has this user finished enrolling a second factor? */
export function hasVerifiedFactor(user: UserWithFactors | null | undefined): boolean {
  const factors = user?.factors;
  if (!Array.isArray(factors)) return false;
  return factors.some((factor) => factor?.status === 'verified');
}

/**
 * May this request perform an action that requires the caller's full assurance?
 *
 * The rule is deliberately narrow: refuse only when we positively know a factor
 * is enrolled AND the token positively is not aal2. An unreadable token is not
 * aal2, so it is refused; a user with no factor is always allowed, so a bad
 * factor list cannot lock out an account that never had MFA.
 */
export function mfaAssuranceSatisfied(
  token: string | null | undefined,
  user: UserWithFactors | null | undefined,
): boolean {
  if (!hasVerifiedFactor(user)) return true;
  return !!token && readAalClaim(token) === 'aal2';
}
