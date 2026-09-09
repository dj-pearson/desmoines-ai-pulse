import { describe, it, expect } from 'vitest';
import { authErrorCopy, needsEmailConfirmation } from '../authErrorMessages';

/**
 * WEB-AUTH-008. /auth rendered `error.message` from supabase-js into a toast,
 * so the failure a real person hits most often after signing up - never having
 * clicked the confirmation link - read "Email not confirmed" and offered
 * nothing. The resend existed on the post-signup screen they had already left.
 */
describe('authErrorCopy', () => {
  it('offers a resend for an unconfirmed address', () => {
    expect(authErrorCopy('email_not_confirmed', null).action).toBe('resend_confirmation');
    expect(needsEmailConfirmation('email_not_confirmed', null)).toBe(true);
  });

  it('recognises the same failure from the message alone', () => {
    // supabase-js only added error codes in 2.4x, and a response without one
    // must not fall back to the generic copy for the one case we can fix.
    expect(needsEmailConfirmation(undefined, 'Email not confirmed')).toBe(true);
    expect(needsEmailConfirmation(null, 'EMAIL NOT CONFIRMED')).toBe(true);
  });

  it('prefers the code over the message when both are present', () => {
    // A stale message with a current code must not win.
    expect(authErrorCopy('invalid_credentials', 'Email not confirmed').action).toBe(
      'reset_password',
    );
  });

  it('keeps a bad password non-committal about whether the account exists', () => {
    const copy = authErrorCopy('invalid_credentials', 'Invalid login credentials');
    expect(copy.action).toBe('reset_password');
    // Enumeration: the copy must not confirm or deny that the address is
    // registered. Splitting this into "no such user" and "wrong password"
    // would be friendlier and would turn the form into an account oracle.
    expect(copy.description).not.toMatch(/no account|not registered|does not exist|no such/i);
    expect(copy.description).not.toMatch(/wrong password|incorrect password/i);
  });

  it('never returns a raw supabase string for an unknown failure', () => {
    const raw = 'AuthApiError: invalid claim: missing sub claim';
    const copy = authErrorCopy('some_new_code_supabase_added', raw);
    expect(copy.description).not.toContain('AuthApiError');
    expect(copy.description).not.toContain(raw);
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.action).toBeUndefined();
  });

  it('handles a failure with neither code nor message', () => {
    const copy = authErrorCopy(undefined, undefined);
    expect(copy.title).toBeTruthy();
    expect(copy.description).toBeTruthy();
  });

  it('tells rate limiting apart from a credential failure', () => {
    expect(authErrorCopy('over_email_send_rate_limit', null).action).toBe('wait');
    expect(
      authErrorCopy(undefined, 'For security purposes, you can only request this after 51 seconds')
        .action,
    ).toBe('wait');
  });

  it('does not offer a resend for anything else', () => {
    // The inline resend renders off this answer, so a false positive puts a
    // button on screen that sends an email nobody asked for.
    for (const code of [
      'invalid_credentials',
      'user_banned',
      'weak_password',
      'signup_disabled',
      'over_request_rate_limit',
    ]) {
      expect(needsEmailConfirmation(code, null)).toBe(false);
    }
  });
});
