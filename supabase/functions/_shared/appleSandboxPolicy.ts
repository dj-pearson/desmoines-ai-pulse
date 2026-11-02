/**
 * Whether an App Store transaction from Apple's SANDBOX may become a premium
 * entitlement (WEB-SEC-051).
 *
 * validate-ios-receipt asks Apple's production API first and falls back to the
 * sandbox one on a 404. Before this, both answers wrote the same
 * user_subscriptions row, so a TestFlight tester's free sandbox purchase
 * unlocked premium on the website and Android too.
 *
 * The fallback cannot simply be removed: App Review buys in the sandbox
 * against the production backend, and a review purchase that does not unlock
 * the app gets the binary rejected. So sandbox grants are kept for an
 * allowlist (the review demo account, the team's own testers) and refused for
 * everyone else, and only once a human sets IOS_SANDBOX_ENFORCE=true. Until
 * then the decision is log-only and nothing changes for anyone.
 *
 * Env (read by the caller, passed in here so this stays pure):
 *   IOS_SANDBOX_ENFORCE            "true" to refuse non-allowlisted sandbox grants
 *   IOS_SANDBOX_ALLOWED_EMAILS     comma-separated, case-insensitive
 *   IOS_SANDBOX_ALLOWED_USER_IDS   comma-separated auth user ids
 *
 * Run: `deno test supabase/functions/_shared/appleSandboxPolicy.test.ts`
 */

export interface SandboxPolicyInput {
  /** What fetchTransactionFromApple reported: 'Production' or 'Sandbox'. */
  environment: string;
  userId: string;
  email: string | null | undefined;
  enforceFlag: string | null | undefined;
  allowedEmails: string | null | undefined;
  allowedUserIds: string | null | undefined;
}

export type SandboxDecisionReason =
  | 'production'
  | 'sandbox_allowlisted'
  | 'sandbox_not_enforced'
  | 'sandbox_refused';

export interface SandboxDecision {
  /** True when the caller should write the premium entitlement. */
  grant: boolean;
  reason: SandboxDecisionReason;
  /**
   * True for a sandbox purchase that would be refused if enforcement were on.
   * Lets the log-only window show who enforcement would affect.
   */
  wouldRefuse: boolean;
}

export const SANDBOX_NOT_ENTITLED = 'sandbox_purchase_not_entitled';

function parseList(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

export function isSandboxEnforced(flag: string | null | undefined): boolean {
  return (flag ?? '').trim().toLowerCase() === 'true';
}

export function decideSandboxGrant(input: SandboxPolicyInput): SandboxDecision {
  // Anything other than an exact 'Production' (Apple also names 'Xcode' and
  // 'LocalTesting') is treated as non-production.
  if (input.environment === 'Production') {
    return { grant: true, reason: 'production', wouldRefuse: false };
  }

  const emails = parseList(input.allowedEmails);
  const ids = parseList(input.allowedUserIds);
  const email = (input.email ?? '').trim().toLowerCase();
  const userId = input.userId.trim().toLowerCase();

  if ((email.length > 0 && emails.has(email)) || (userId.length > 0 && ids.has(userId))) {
    return { grant: true, reason: 'sandbox_allowlisted', wouldRefuse: false };
  }

  if (!isSandboxEnforced(input.enforceFlag)) {
    return { grant: true, reason: 'sandbox_not_enforced', wouldRefuse: true };
  }

  return { grant: false, reason: 'sandbox_refused', wouldRefuse: true };
}
