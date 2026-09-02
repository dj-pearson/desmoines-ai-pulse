import { describe, it, expect } from 'vitest';
import { interpretSignUpResult } from '@/lib/signUpResult';

/**
 * WEB-AUTH-004 -- the two signup branches that used to be indistinguishable.
 *
 * Supabase answers a signup for an ALREADY-REGISTERED address with a user and
 * no session, exactly like a fresh signup, so the response cannot be used to
 * enumerate accounts. The app read only `user && !session`, so a returning user
 * who had forgotten their account was shown "Check your email" for an email
 * that was never sent, and a Resend button that calls
 * auth.resend({ type: 'signup' }) -- which errors for a confirmed address.
 *
 * The one tell is `identities: []`.
 */
describe('interpretSignUpResult', () => {
  it('a fresh signup needs verification and is not already registered', () => {
    const out = interpretSignUpResult({
      user: { identities: [{ provider: 'email' }] },
      session: null,
    });
    expect(out).toEqual({ needsVerification: true, alreadyRegistered: false });
  });

  it('an existing address is flagged, so Resend can be hidden', () => {
    // The whole defect, in one assertion.
    const out = interpretSignUpResult({ user: { identities: [] }, session: null });
    expect(out.alreadyRegistered).toBe(true);
    // Still "needs verification": the screen stays neutral. Naming the account
    // is the enumeration the neutral response exists to prevent.
    expect(out.needsVerification).toBe(true);
  });

  it('a signup that returns a session needs no verification', () => {
    // Confirmations off, or an auto-confirmed project.
    const out = interpretSignUpResult({
      user: { identities: [{ provider: 'email' }] },
      session: { access_token: 'x' },
    });
    expect(out.needsVerification).toBe(false);
    expect(out.alreadyRegistered).toBe(false);
  });

  it('no user means nothing was created', () => {
    expect(interpretSignUpResult({ user: null, session: null })).toEqual({
      needsVerification: false,
      alreadyRegistered: false,
    });
    expect(interpretSignUpResult(null)).toEqual({
      needsVerification: false,
      alreadyRegistered: false,
    });
    expect(interpretSignUpResult(undefined)).toEqual({
      needsVerification: false,
      alreadyRegistered: false,
    });
  });

  it('a missing identities field is treated as a normal signup', () => {
    // Deliberate. If supabase-js ever stops returning the field, the neutral
    // screen WITH a working Resend is the safer of the two wrong answers --
    // the alternative hides Resend from every real new user.
    const out = interpretSignUpResult({ user: {}, session: null });
    expect(out.alreadyRegistered).toBe(false);
    expect(out.needsVerification).toBe(true);

    expect(interpretSignUpResult({ user: { identities: null }, session: null }).alreadyRegistered)
      .toBe(false);
  });

  it('an existing address that somehow returns a session is not a verification screen', () => {
    const out = interpretSignUpResult({ user: { identities: [] }, session: { access_token: 'x' } });
    expect(out.needsVerification).toBe(false);
    expect(out.alreadyRegistered).toBe(true);
  });
});
