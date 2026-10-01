import { describe, it, expect } from 'vitest';
import { readAuthCallbackError, looksConfirmed } from '@/lib/authCallbackError';

/**
 * WEB-AUTH-005. /auth/verified rendered "Email Verified! 🎉" unconditionally
 * and read no error parameter, so an expired link, a reused link and a
 * cross-device confirmation all produced a celebration page and a ten-second
 * countdown to the homepage -- with no session, and nothing saying why.
 */
describe('readAuthCallbackError', () => {
  it('returns null when nothing went wrong', () => {
    expect(readAuthCallbackError('', '')).toBeNull();
    expect(readAuthCallbackError(null, undefined)).toBeNull();
    expect(readAuthCallbackError('?redirect=/profile', '#access_token=abc')).toBeNull();
  });

  it('reads an error out of the QUERY string', () => {
    const err = readAuthCallbackError('?error_code=otp_expired', '');
    expect(err?.code).toBe('otp_expired');
    expect(err?.canResend).toBe(true);
    expect(err?.message).toMatch(/expired/i);
  });

  it('reads an error out of the FRAGMENT, which is where email links put it', () => {
    // The half that was missed. A fragment never reaches a server and
    // useSearchParams does not expose it, so a check on the query string alone
    // sees nothing wrong with an expired confirmation link.
    const err = readAuthCallbackError(
      '',
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(err?.code).toBe('otp_expired');
  });

  it('tolerates the separators being present or absent', () => {
    expect(readAuthCallbackError('error_code=otp_expired', '')?.code).toBe('otp_expired');
    expect(readAuthCallbackError('', 'error_code=otp_expired')?.code).toBe('otp_expired');
  });

  it('prefers the fragment when both carry something', () => {
    const err = readAuthCallbackError('?error=server_error', '#error_code=otp_expired');
    expect(err?.code).toBe('otp_expired');
  });

  it('falls back to error when error_code is absent', () => {
    expect(readAuthCallbackError('?error=access_denied', '')?.code).toBe('access_denied');
  });

  it('gives an unknown code a usable message rather than nothing', () => {
    const err = readAuthCallbackError('?error_code=something_new', '');
    expect(err?.code).toBe('something_new');
    expect(err?.message.length).toBeGreaterThan(20);
    expect(err?.canResend).toBe(true);
  });

  it('never surfaces Supabase\'s developer-facing description as the message', () => {
    const err = readAuthCallbackError(
      '',
      '#error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(err?.message).not.toContain('Email link is invalid or has expired');
  });

  it('explains the cross-device case, which is the one users cannot guess', () => {
    // PKCE keeps the code verifier in the browser that started the flow, so a
    // link opened on a phone after signing up on a desktop fails with
    // access_denied and no other clue.
    const err = readAuthCallbackError('?error=access_denied', '');
    expect(err?.message).toMatch(/different browser/i);
  });
});

describe('looksConfirmed', () => {
  it('is true with a session', () => {
    expect(looksConfirmed('', '', true)).toBe(true);
  });

  it('is true when a confirmation redirect landed, before the session exists', () => {
    expect(looksConfirmed('', '#access_token=abc&type=signup', false)).toBe(true);
    expect(looksConfirmed('?code=abc', '', false)).toBe(true);
  });

  it('is FALSE for a bare visit, which is not the same as no error', () => {
    // Someone opening /auth/verified from history or the address bar has no
    // error and no confirmation either. Celebrating for them is the same defect
    // in a quieter form.
    expect(looksConfirmed('', '', false)).toBe(false);
  });

  it('is false whenever there is an error, even with a session', () => {
    expect(looksConfirmed('?error_code=otp_expired', '', true)).toBe(false);
  });
});
