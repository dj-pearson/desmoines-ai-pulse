/**
 * What the advertiser is told after an upload (WEB-ADS-006 AC3).
 *
 * Advertise.tsx sells a review turnaround and the upload form has always said
 * "submitted for review. You'll be notified when it's approved" - a promise
 * about a machine that, at the time this was written, was not deployed, whose
 * cron sweep had been parked after 4,320 404s a month, and which nothing in
 * src/ ever mentioned. The advertiser waited for a verdict nobody was computing.
 *
 * The verdict itself is produced server-side and written onto the row by
 * supabase/functions/campaign-creative-review. THE FORM DOES NOT INVOKE IT, and
 * that is deliberate rather than a shortcut: an AFTER INSERT trigger already
 * enqueues the review (migration 20260620000006), and the function answers only
 * to an admin JWT, the service role or EDGE_FUNCTION_API_KEY, because it does
 * cost-bearing AI work and an ordinary user who could call it could bill us.
 * So the form READS the outcome instead of causing it.
 *
 * Which means PENDING is a first-class outcome, not a loading state to hide.
 * Until the function is deployed it is the ONLY outcome, so the copy for it has
 * to be true on its own and must not promise a verdict that is not coming.
 */

export interface CreativeReviewRow {
  auto_reviewed?: boolean | null;
  is_approved?: boolean | null;
  auto_review_reasons?: string[] | null;
  rejection_reason?: string | null;
}

export type CreativeVerdictKind = 'approved' | 'rejected' | 'deferred' | 'pending';

export interface CreativeVerdictMessage {
  kind: CreativeVerdictKind;
  title: string;
  description: string;
  /** Matches the toast variants this app already uses. */
  variant: 'default' | 'destructive';
}

/**
 * Read the row's review columns.
 *
 * The three decided outcomes mirror decision.ts exactly, including the one that
 * is neither an approval nor a rejection: rejection_reason is NULL when nothing
 * the advertiser can fix went wrong, and telling them their ad was rejected in
 * that case would be false.
 */
export function describeAutoReview(row: CreativeReviewRow | null | undefined): CreativeVerdictMessage {
  if (!row?.auto_reviewed) {
    return {
      kind: 'pending',
      title: 'Creative uploaded',
      description:
        'Your ad is queued for review. We will email you when it has been checked.',
      variant: 'default',
    };
  }

  if (row.is_approved) {
    return {
      kind: 'approved',
      title: 'Creative approved',
      description: 'Your ad passed every check and will run on its scheduled dates.',
      variant: 'default',
    };
  }

  const reasons = (row.auto_review_reasons ?? []).filter(Boolean);

  if (row.rejection_reason) {
    return {
      kind: 'rejected',
      title: 'Creative needs changes',
      description: `${row.rejection_reason} Upload a revised creative once you have fixed it.`,
      variant: 'destructive',
    };
  }

  return {
    kind: 'deferred',
    title: 'Creative sent for human review',
    description: reasons.length
      ? `An automated check could not run (${reasons.join('; ')}), so a person will review this one. Nothing is wrong with your ad.`
      : 'An automated check could not run, so a person will review this one. Nothing is wrong with your ad.',
    variant: 'default',
  };
}
