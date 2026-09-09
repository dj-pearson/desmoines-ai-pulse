/**
 * Supabase auth failures, turned into something a person can act on
 * (WEB-AUTH-008).
 *
 * /auth showed `error.message` straight from supabase-js. That is a string
 * written for a developer reading a stack trace: "Email not confirmed" tells
 * someone their sign-in failed and nothing about what to do next, and the one
 * thing that WOULD help - resending the confirmation - existed only on the
 * post-signup screen they had already navigated away from.
 *
 * Matching is on `code` first, because that is the stable identifier, and on
 * the message only as a fallback: supabase-js added error codes in 2.4x and
 * older responses in the wild carry the message alone.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. "Invalid login credentials" stays
 * non-committal. Splitting it into "no such account" and "wrong password"
 * would be friendlier and would turn the form into an account-existence
 * oracle, which is the standard enumeration weakness. The only case that names
 * an account state is email_not_confirmed, and Supabase has already disclosed
 * that by returning the code.
 */
export type AuthErrorAction = 'resend_confirmation' | 'reset_password' | 'wait';

export interface AuthErrorCopy {
  title: string;
  description: string;
  /** What the UI should offer next, when there is something useful to offer. */
  action?: AuthErrorAction;
}

const BY_CODE: Record<string, AuthErrorCopy> = {
  invalid_credentials: {
    title: 'Sign in failed',
    description: "That email and password don't match. Check for typos, or reset your password.",
    action: 'reset_password',
  },
  email_not_confirmed: {
    title: 'Confirm your email first',
    description:
      'Your account exists but the email address has not been confirmed yet. Check your inbox and spam folder, or send yourself a new confirmation link.',
    action: 'resend_confirmation',
  },
  over_request_rate_limit: {
    title: 'Too many attempts',
    description: 'Too many attempts from this device. Wait a minute and try again.',
    action: 'wait',
  },
  over_email_send_rate_limit: {
    title: 'Too many emails',
    description:
      'We have sent several emails to this address recently. Wait a few minutes before asking for another.',
    action: 'wait',
  },
  email_provider_disabled: {
    title: 'Email sign-in is unavailable',
    description: 'Email sign-in is turned off right now. Try Google or Apple, or contact support.',
  },
  user_banned: {
    title: 'Account unavailable',
    description: 'This account cannot be used right now. Contact support if you think that is wrong.',
  },
  weak_password: {
    title: 'Choose a stronger password',
    description: 'Use at least 8 characters, mixing letters, numbers and a symbol.',
  },
  user_already_exists: {
    title: 'That address is already registered',
    description: 'Sign in instead, or reset your password if you have forgotten it.',
    action: 'reset_password',
  },
  same_password: {
    title: 'Pick a different password',
    description: 'The new password has to differ from your current one.',
  },
  signup_disabled: {
    title: 'Sign-ups are paused',
    description: 'New accounts are not being accepted at the moment. Try again later.',
  },
};

/**
 * Message-text fallbacks, for responses that carry no code. Keys are matched
 * case-insensitively as substrings, so they must stay specific enough not to
 * catch an unrelated message.
 */
const BY_MESSAGE: Array<[string, string]> = [
  ['email not confirmed', 'email_not_confirmed'],
  ['invalid login credentials', 'invalid_credentials'],
  ['email logins are disabled', 'email_provider_disabled'],
  ['email rate limit exceeded', 'over_email_send_rate_limit'],
  ['for security purposes, you can only request this after', 'over_request_rate_limit'],
  ['user already registered', 'user_already_exists'],
  ['password should be at least', 'weak_password'],
  ['signups not allowed', 'signup_disabled'],
];

const FALLBACK: AuthErrorCopy = {
  title: 'Sign in failed',
  description: 'Something went wrong on our side. Please try again in a moment.',
};

/**
 * Copy for an auth failure. `code` wins; `message` is the fallback path; an
 * unrecognised failure gets neutral copy rather than the raw string, because
 * the raw string is where "AuthApiError: invalid claim: missing sub claim"
 * reaches a reader who wanted to look at restaurants.
 */
export function authErrorCopy(
  code: string | undefined | null,
  message: string | undefined | null,
): AuthErrorCopy {
  if (code && BY_CODE[code]) return BY_CODE[code];

  const haystack = (message ?? '').toLowerCase();
  if (haystack) {
    for (const [needle, mapped] of BY_MESSAGE) {
      if (haystack.includes(needle)) return BY_CODE[mapped];
    }
  }

  return FALLBACK;
}

/** Whether a failure is the "you never clicked the link" one. */
export function needsEmailConfirmation(
  code: string | undefined | null,
  message: string | undefined | null,
): boolean {
  return authErrorCopy(code, message).action === 'resend_confirmation';
}
