/**
 * What a Supabase signUp response actually means (WEB-AUTH-004).
 *
 * Signing up with an address that already has an account does NOT return an
 * error. Supabase deliberately answers with a user object so the response is
 * indistinguishable from a fresh signup and cannot be used to enumerate who has
 * an account. The one tell is `identities`: an empty array means "this address
 * is taken", a populated one means "this account was just created".
 *
 * The app read only `user && !session`, so both cases produced the same
 * "Check your email" screen -- and the Resend button on it calls
 * auth.resend({ type: 'signup' }), which for an already-confirmed address
 * errors. So the returning user who forgot they had an account was told to wait
 * for an email that was never sent, and given a button that fails when they
 * press it.
 *
 * Pure and exported so both branches can be tested without a network.
 */

export interface SignUpOutcome {
  /** The account still has to confirm an email before it can sign in. */
  needsVerification: boolean;
  /**
   * The address already had an account. The screen stays neutral -- saying so
   * outright would be the enumeration Supabase's response shape exists to
   * prevent -- but Resend must be hidden and sign-in / reset offered instead.
   */
  alreadyRegistered: boolean;
}

/** The shape this reads, kept narrow so a supabase-js type change cannot silently widen it. */
export interface SignUpResponseLike {
  user?: { identities?: unknown[] | null } | null;
  session?: unknown | null;
}

export function interpretSignUpResult(data: SignUpResponseLike | null | undefined): SignUpOutcome {
  const user = data?.user ?? null;
  const hasSession = !!data?.session;

  // No user at all: nothing was created and nothing needs confirming. Callers
  // treat this as an ordinary failure.
  if (!user) {
    return { needsVerification: false, alreadyRegistered: false };
  }

  // `identities` is only meaningfully empty on the already-registered path.
  // An UNDEFINED identities is treated as a normal signup on purpose: if a
  // future supabase-js stops returning the field, the neutral screen with a
  // working Resend is the safer of the two wrong answers.
  const identities = user.identities;
  const alreadyRegistered = Array.isArray(identities) && identities.length === 0;

  return {
    needsVerification: !hasSession,
    alreadyRegistered,
  };
}
