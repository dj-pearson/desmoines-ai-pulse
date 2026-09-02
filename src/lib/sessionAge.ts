/**
 * How old a session actually is (WEB-AUTH-007).
 *
 * useSessionTimeout measured the 8-hour maximum from `Date.now()` at MOUNT.
 * That is page-load age, not session age, and the two are unrelated: a tab
 * opened at 09:00 and reloaded at 16:55 starts its eight hours over at 16:55,
 * while a tab left open since 09:00 is logged out at 17:00 even though the
 * session behind it may be minutes old. The cap was measuring the wrong thing
 * in both directions.
 *
 * The session's real start is in the access token. `iat` is when the token was
 * issued, which moves on every refresh, so it is NOT the session start --
 * Supabase refreshes hourly and reading `iat` would reset the cap every hour,
 * making an 8-hour maximum unreachable. What does not move is the auth event
 * that created the session, which supabase-js exposes as
 * `session.user.last_sign_in_at`.
 *
 * Pure, so both sources and both failure modes can be tested without a session.
 */

export interface SessionLike {
  access_token?: string | null;
  user?: { last_sign_in_at?: string | null } | null;
}

/** Decode a JWT payload without verifying it. Local reads only, never a trust decision. */
export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Epoch milliseconds at which this session began, or null if it cannot be told.
 *
 * NULL IS A REAL ANSWER AND CALLERS MUST HANDLE IT. Returning `Date.now()` as a
 * fallback would silently restore the page-load-relative behaviour this
 * replaces, and it would do so invisibly.
 */
export function sessionStartedAt(session: SessionLike | null | undefined): number | null {
  if (!session) return null;

  const lastSignIn = session.user?.last_sign_in_at;
  if (lastSignIn) {
    const t = Date.parse(lastSignIn);
    if (Number.isFinite(t)) return t;
  }

  // Fallback for a session shape without the user object. `iat` overstates
  // freshness after a refresh, so this can only ever make the cap MORE
  // generous, never cut a session short by mistake.
  const payload = decodeJwtPayload(session.access_token);
  const iat = payload?.iat;
  if (typeof iat === 'number' && Number.isFinite(iat)) return iat * 1000;

  return null;
}

/** Milliseconds this session has existed, or null when the start is unknown. */
export function sessionAgeMs(
  session: SessionLike | null | undefined,
  now: number = Date.now(),
): number | null {
  const started = sessionStartedAt(session);
  if (started === null) return null;
  // A clock skew that puts the start in the future reads as age 0 rather than
  // negative, so no comparison against a cap can wrap.
  return Math.max(0, now - started);
}
