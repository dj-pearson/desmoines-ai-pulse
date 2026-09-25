/**
 * What the Best-of booth may promise, and the copy that depends on it.
 *
 * Changing a vote is an upsert on votes (category_id, user_id), which needs a
 * FOR UPDATE policy. That policy is written
 * (supabase/migrations/20260930000003_votes_update_policy.sql) but not applied
 * yet (plan-stay-pass2.md D14). Until it is, the first vote in a category
 * works and every change fails with 42501, so the booth does not offer one.
 *
 * The PR that applies the migration flips this to true. Nothing else changes.
 */
export const VOTE_CHANGE_AVAILABLE = false;

/** Postgres "insufficient_privilege": RLS refused the write. */
export const RLS_DENIED_CODE = '42501';

/** Shown after a vote when changing it is not possible this round. */
export const VOTES_FINAL_COPY = 'Votes are final for this round.';

/**
 * The line under the booth heading. "Per account" rather than "per person":
 * nothing stops one person holding two accounts until D5 adds a
 * confirmed-email rule, so "per person" is a claim the site can't back.
 */
export function boothRulesCopy(categoryName: string, changeAvailable = VOTE_CHANGE_AVAILABLE): string {
  const base = `One vote per account in ${categoryName}.`;
  return changeAvailable ? `${base} You can change it while voting is open.` : `${base} ${VOTES_FINAL_COPY}`;
}

/** The index hero's closing sentence. */
export function indexRulesCopy(changeAvailable = VOTE_CHANGE_AVAILABLE): string {
  return changeAvailable
    ? 'One vote per account in each category, and you can change it while voting is open.'
    : 'One vote per account in each category. Votes are final for this round.';
}

/** An error carrying the PostgREST code, so the booth can tell RLS from a network failure. */
export interface VoteWriteError extends Error {
  code?: string;
}

export function voteWriteError(message: string, code: string | undefined): VoteWriteError {
  const error: VoteWriteError = new Error(message);
  if (code) error.code = code;
  return error;
}

/**
 * The toast body for a failed vote.
 *
 * 42501 on an upsert where the voter already had a row means the change was
 * refused and the old row is untouched, so say so. Without an earlier vote a
 * 42501 is a refused insert, and "your earlier vote still counts" would be
 * false.
 */
export function voteFailureMessage(error: unknown, hadEarlierVote: boolean): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  if (code === RLS_DENIED_CODE) {
    return hadEarlierVote
      ? "We couldn't change your vote. Your earlier vote still counts."
      : "We couldn't save your vote. Please try again later.";
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Please try again.';
}

/**
 * "Best Pizza" -> "Pizza". Category names already start with "Best", and a
 * template that adds its own produced "Best Best Pizza in Des Moines".
 */
export function stripLeadingBest(name: string): string {
  const stripped = name.replace(/^\s*best\s+/i, '').trim();
  return stripped || name.trim();
}

/** The ItemList name for a ranked category page. */
export function rankingSchemaName(categoryName: string): string {
  return `Best ${stripLeadingBest(categoryName)} in Des Moines`;
}

export function pluralVotes(n: number): string {
  return `${n} vote${n === 1 ? '' : 's'}`;
}
