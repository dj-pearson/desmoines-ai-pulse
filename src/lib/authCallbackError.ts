/**
 * Reading an auth error off a Supabase redirect (WEB-AUTH-005).
 *
 * /auth/verified rendered "Email Verified!" (with an emoji) unconditionally. It read no
 * error parameter at all, so an expired link, a reused link and a
 * cross-device confirmation all landed on a celebration page and a ten-second
 * countdown to the homepage -- with no session, and nothing telling the user
 * why they were still logged out.
 *
 * THE PARAMETERS ARRIVE IN TWO PLACES and only checking one is how this stays
 * half-broken. Supabase puts PKCE and OAuth failures in the QUERY STRING
 * (?error=...) and implicit-flow and email-link failures in the URL FRAGMENT
 * (#error=...). The fragment never reaches a server and react-router's
 * useSearchParams does not see it either.
 *
 * Pure, so both shapes can be tested without a browser.
 */

export interface AuthCallbackError {
  /** Supabase's machine-readable reason, e.g. "otp_expired". */
  code: string;
  /** What to show the reader. Never Supabase's raw description alone. */
  message: string;
  /** Whether offering "send a new link" would actually help. */
  canResend: boolean;
}

/**
 * How long a link lasts, said without a number (account plan WP2 item 6).
 *
 * The copy used to promise 24 hours for confirmation and one hour for reset.
 * GoTrue uses one mailer OTP expiry for both, and supabase/config.toml sets
 * neither, so at least one of those was wrong and possibly both. Put a number
 * back only once D9 has read the configured value off the auth dashboard.
 */
export const LINK_EXPIRY_COPY = 'Links expire. Request a new one and it arrives in a minute or two.';

/**
 * Which redirect this is. The same error code means different things: an
 * `access_denied` on a confirmation link is a reused or cross-browser link,
 * while on an OAuth return it is someone pressing Cancel at Google.
 */
export type AuthFlow = 'email' | 'oauth' | 'recovery';

type Copy = { message: string; canResend: boolean };

/**
 * Messages we write ourselves, because Supabase's descriptions are written for
 * developers ("Email link is invalid or has expired") and do not tell a person
 * what to do next or why it happened to them.
 */
const KNOWN: Record<AuthFlow, Record<string, Copy>> = {
  email: {
    otp_expired: {
      message: `That confirmation link has expired. ${LINK_EXPIRY_COPY}`,
      canResend: true,
    },
    access_denied: {
      message:
        'That confirmation link could not be used. This usually means it was already opened, or it was opened in a different browser from the one you signed up in. A new link will work.',
      canResend: true,
    },
    invalid_request: {
      message:
        'That confirmation link is not valid. It may have been broken across two lines by an email client. Request a new one and open it in a single click.',
      canResend: true,
    },
    server_error: {
      message: 'Something went wrong on our side while confirming your email. Trying again usually works.',
      canResend: true,
    },
  },
  oauth: {
    access_denied: {
      message: 'Sign-in was cancelled before it finished, so nothing changed. Try again when you are ready.',
      canResend: false,
    },
    server_error: {
      message:
        "Google or Apple didn't hand the sign-in back to us. Try again, or sign in with your email and password.",
      canResend: false,
    },
  },
  recovery: {
    otp_expired: {
      message: `That reset link has expired. ${LINK_EXPIRY_COPY}`,
      canResend: true,
    },
    access_denied: {
      message:
        'That reset link could not be used. It was probably opened already, or opened in a different browser from the one that asked for it. A new link will work.',
      canResend: true,
    },
    invalid_request: {
      message:
        'That reset link is not valid. It may have been broken across two lines by an email client. Request a new one and open it in a single click.',
      canResend: true,
    },
  },
};

const FALLBACK: Record<AuthFlow, Copy> = {
  email: {
    message:
      'We could not confirm your email with that link. Request a new one, and open it on the device you signed up on if you can.',
    canResend: true,
  },
  oauth: {
    message: "We couldn't finish signing you in. Try again, or sign in with your email and password.",
    canResend: false,
  },
  recovery: {
    message: `We could not use that reset link. ${LINK_EXPIRY_COPY}`,
    canResend: true,
  },
};

/**
 * @param search the `?...` part, with or without its leading `?`
 * @param hash   the `#...` part, with or without its leading `#`
 * @param flow   which redirect this is; decides the wording, not the code
 */
export function readAuthCallbackError(
  search: string | undefined | null,
  hash: string | undefined | null,
  flow: AuthFlow = 'email',
): AuthCallbackError | null {
  const params = new URLSearchParams((search ?? '').replace(/^\?/, ''));
  const fragment = new URLSearchParams((hash ?? '').replace(/^#/, ''));

  // The fragment wins when both carry something: on a redirect that has both,
  // the fragment is the one Supabase wrote last.
  const code =
    fragment.get('error_code') ||
    fragment.get('error') ||
    params.get('error_code') ||
    params.get('error');

  if (!code) return null;

  const known = KNOWN[flow][code];
  if (known) return { code, ...known };

  return { code, ...FALLBACK[flow] };
}

/**
 * True when the URL says the confirmation succeeded, rather than merely not
 * saying it failed.
 *
 * Deliberately NOT the same as `readAuthCallbackError(...) === null`. A user who
 * types /auth/verified into the address bar, or opens it from history, has no
 * error and no confirmation either, and celebrating for them is the same defect
 * in a quieter form.
 */
export function looksConfirmed(
  search: string | undefined | null,
  hash: string | undefined | null,
  hasSession: boolean,
): boolean {
  if (readAuthCallbackError(search, hash)) return false;
  if (hasSession) return true;

  const params = new URLSearchParams((search ?? '').replace(/^\?/, ''));
  const fragment = new URLSearchParams((hash ?? '').replace(/^#/, ''));
  // A token in either place means a confirmation redirect actually landed here,
  // even if the session has not been established yet.
  return (
    !!fragment.get('access_token') ||
    !!fragment.get('type') ||
    !!params.get('code') ||
    params.get('confirmed') === 'true'
  );
}
