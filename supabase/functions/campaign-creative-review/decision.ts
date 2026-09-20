/**
 * What the auto-review may decide on its own (WEB-ADS-006 AC4).
 *
 * Extracted from index.ts because that file imports from esm.sh and cannot be
 * loaded in a test without the network, and because this is the part with a
 * consequence: it decides whether an ad goes live on a public site with nobody
 * having looked at it.
 *
 * ── A CHECK THAT DID NOT RUN IS NOT A CHECK THAT PASSED ─────────────────────
 *
 * brandSafe() had three paths returning `safe: true` while moderating nothing -
 * no ANTHROPIC_API_KEY configured, a non-2xx from the API, and any thrown error
 * - and two of them said so in their own note ("failed open"). The verdict was
 * `reasons.length === 0`, so an environment without the key auto-approved every
 * creative and the audit log recorded `creative_auto_approved` for each one.
 * That is the worst shape this bug comes in: silent, the DEFAULT in an
 * unprovisioned environment, and it leaves evidence saying the check passed.
 *
 * The story words AC4 as "auto-approve only above the confidence threshold the
 * function already defines". There is no confidence threshold - every check is
 * boolean. The rule that means the same thing is: auto-approval requires every
 * check to have RUN and PASSED.
 *
 * ── NOT RUNNING IS NOT A REJECTION, AND THE DIFFERENCE IS THE ADVERTISER'S ──
 *
 * index.ts had one list. It set is_approved=false AND rejection_reason from the
 * same strings, so telling an advertiser "your ad did not pass" and "we could
 * not check your ad" would have been the same message. The story says the rest
 * "goes to the admin queue with the AI summary attached", not that it is
 * rejected. So the two are separate here:
 *
 *   failures     things the advertiser can fix. Become rejection_reason.
 *   unavailable  checks that could not run. Block auto-approval, reach the
 *                admin queue, and leave rejection_reason NULL.
 *
 * Failing closed on a moderation outage is a deliberate trade: an advertiser
 * waits for a human rather than unreviewed copy appearing on the site.
 */

export interface BrandSafetyResult {
  /** The verdict. Meaningful only when `checked` is true. */
  safe: boolean;
  /** Whether the check actually ran. False for a missing key, an API error or a throw. */
  checked: boolean;
  /** Detail, carried into auto_review_checks so the admin queue can show it. */
  note: string;
}

export interface AutoReviewOutcome {
  approved: boolean;
  /** Real failures. Empty when nothing the advertiser can act on went wrong. */
  failures: string[];
  /** Checks that could not run. */
  unavailable: string[];
  /** What auto_review_reasons carries: failures first, then what went unchecked. */
  summary: string[];
  /** true when a human has to look because something could not be checked. */
  needsHuman: boolean;
  /** The security_audit_logs action, so the log distinguishes all three outcomes. */
  auditAction: 'creative_auto_approved' | 'creative_auto_rejected' | 'creative_review_deferred';
}

/**
 * Where a brand-safety result lands.
 *
 * Two outcomes an admin reading the queue must be able to tell apart: the copy
 * was READ and flagged, versus the copy was never read.
 */
export function brandSafetyFinding(
  bs: BrandSafetyResult,
): { failure?: string; unavailable?: string } {
  if (!bs.checked) return { unavailable: `Brand-safety check did not run: ${bs.note}` };
  if (!bs.safe) return { failure: 'Ad text failed brand-safety review' };
  return {};
}

export function autoReviewOutcome(failures: string[], unavailable: string[]): AutoReviewOutcome {
  const approved = failures.length === 0 && unavailable.length === 0;
  return {
    approved,
    failures,
    unavailable,
    summary: [...failures, ...unavailable],
    needsHuman: failures.length === 0 && unavailable.length > 0,
    auditAction: approved
      ? 'creative_auto_approved'
      : failures.length > 0
        ? 'creative_auto_rejected'
        : 'creative_review_deferred',
  };
}
