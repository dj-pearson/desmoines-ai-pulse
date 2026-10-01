import { describe, it, expect } from 'vitest';
import { sessionStartedAt, sessionAgeMs, decodeJwtPayload } from '@/lib/sessionAge';

/**
 * WEB-AUTH-007. useSessionTimeout measured the 8-hour maximum from Date.now()
 * at MOUNT, which is page-load age and unrelated to session age. A tab opened
 * at 09:00 and reloaded at 16:55 started its eight hours over at 16:55; a tab
 * left open since 09:00 was signed out at 17:00 even when the session behind it
 * was minutes old. Wrong in both directions.
 */

/** Build an unsigned JWT with the given payload. */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}

describe('sessionStartedAt', () => {
  it('prefers last_sign_in_at, which does not move on a token refresh', () => {
    // The reason it is preferred: Supabase refreshes hourly, so reading `iat`
    // would reset the cap every hour and make an 8-hour maximum unreachable.
    const signedIn = '2026-09-02T09:00:00.000Z';
    const started = sessionStartedAt({
      user: { last_sign_in_at: signedIn },
      access_token: jwt({ iat: Math.floor(Date.parse('2026-09-02T16:00:00Z') / 1000) }),
    });
    expect(started).toBe(Date.parse(signedIn));
  });

  it('falls back to iat when there is no user object', () => {
    const iat = Math.floor(Date.parse('2026-09-02T09:00:00Z') / 1000);
    expect(sessionStartedAt({ access_token: jwt({ iat }) })).toBe(iat * 1000);
  });

  it('returns null rather than now() when nothing can be read', () => {
    // Substituting now() would silently restore the page-load-relative
    // behaviour this replaces, and do it invisibly.
    expect(sessionStartedAt(null)).toBeNull();
    expect(sessionStartedAt(undefined)).toBeNull();
    expect(sessionStartedAt({})).toBeNull();
    expect(sessionStartedAt({ access_token: 'not-a-jwt' })).toBeNull();
    expect(sessionStartedAt({ user: { last_sign_in_at: 'nonsense' } })).toBeNull();
    expect(sessionStartedAt({ access_token: jwt({ sub: 'abc' }) })).toBeNull();
  });
});

describe('sessionAgeMs', () => {
  const NOW = Date.parse('2026-09-02T17:00:00Z');

  it('measures from sign-in, not from page load', () => {
    const age = sessionAgeMs({ user: { last_sign_in_at: '2026-09-02T09:00:00Z' } }, NOW);
    expect(age).toBe(8 * 60 * 60 * 1000);
  });

  it('a freshly signed-in session in a long-open tab is young', () => {
    // The case the old measurement got backwards: the tab is old, the session
    // is not, and the user was signed out anyway.
    const age = sessionAgeMs({ user: { last_sign_in_at: '2026-09-02T16:55:00Z' } }, NOW);
    expect(age).toBe(5 * 60 * 1000);
    expect(age! < 8 * 60 * 60 * 1000).toBe(true);
  });

  it('a reload does not reset the age', () => {
    // The other direction: reloading used to restart the eight hours.
    const session = { user: { last_sign_in_at: '2026-09-02T09:00:00Z' } };
    expect(sessionAgeMs(session, NOW)).toBe(sessionAgeMs(session, NOW));
    expect(sessionAgeMs(session, NOW)! >= 8 * 60 * 60 * 1000).toBe(true);
  });

  it('clock skew reads as age zero, never negative', () => {
    // A negative age would wrap every comparison against the cap.
    expect(sessionAgeMs({ user: { last_sign_in_at: '2026-09-02T18:00:00Z' } }, NOW)).toBe(0);
  });

  it('is null when the start is unknown', () => {
    expect(sessionAgeMs({}, NOW)).toBeNull();
  });
});

describe('decodeJwtPayload', () => {
  it('reads a payload without verifying it', () => {
    expect(decodeJwtPayload(jwt({ sub: 'u1', aal: 'aal2' }))).toEqual({ sub: 'u1', aal: 'aal2' });
  });

  it('never throws on malformed input', () => {
    for (const bad of [null, undefined, '', 'a', 'a.b', 'a.!!!.c', 'a.eyJ9.c']) {
      expect(() => decodeJwtPayload(bad)).not.toThrow();
    }
  });
});
