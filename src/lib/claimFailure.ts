/**
 * What to tell an owner whose "Claim this listing" press failed.
 *
 * ClaimListingCta used to toast `err.message`, which is whatever PostgREST
 * passed through: "claim_listing: this listing is already claimed" with the
 * function name on the front, "duplicate key value violates unique constraint
 * business_claims_one_verified_owner" when two owners raced, or "Failed to
 * fetch". The same class of leak WEB-ADS-024 closed on /unsubscribe.
 *
 * Each kind maps to a sentence written for the owner, and the CTA uses the
 * kind to decide what to render next: an already-claimed listing stops
 * offering a button that can only fail again.
 */

export type ClaimFailureKind =
  /** Somebody else holds the verified claim. Expected; not an error to report. */
  | "already_claimed"
  /** This user already has an open claim (a double press that raced the first). */
  | "own_claim_open"
  /** The session ran out between rendering the button and pressing it. */
  | "signed_out"
  /** Anything else: network, permissions, an unexpected server error. */
  | "unknown";

export interface ClaimFailure {
  kind: ClaimFailureKind;
  message: string;
}

export const CLAIM_FAILURE_COPY: Record<ClaimFailureKind, string> = {
  already_claimed: "Someone from this business has already verified the listing. If that should be you, contact us.",
  own_claim_open: "Your claim is already in. We'll check it and get back to you.",
  signed_out: "Your sign-in ran out. Sign in again to claim this listing.",
  unknown: "Your claim didn't go through. Try again in a moment.",
};

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

function field(err: unknown, key: keyof ErrorLike): string {
  if (err && typeof err === "object" && key in err) {
    const v = (err as ErrorLike)[key];
    return typeof v === "string" ? v : "";
  }
  return "";
}

export function describeClaimFailure(err: unknown): ClaimFailure {
  const code = field(err, "code");
  const text = `${field(err, "message")} ${field(err, "details")}`;

  // claim_listing's own refusal (20260920000005), or the partial unique index
  // that backs it when two owners verify in the same instant.
  if (/already claimed/i.test(text) || (code === "23505" && /one_verified_owner/.test(text))) {
    return { kind: "already_claimed", message: CLAIM_FAILURE_COPY.already_claimed };
  }
  if (code === "23505" && /one_open_per_user/.test(text)) {
    return { kind: "own_claim_open", message: CLAIM_FAILURE_COPY.own_claim_open };
  }
  if (/sign in to claim/i.test(text)) {
    return { kind: "signed_out", message: CLAIM_FAILURE_COPY.signed_out };
  }
  return { kind: "unknown", message: CLAIM_FAILURE_COPY.unknown };
}

/**
 * An Error that keeps PostgREST's code and details. `new Error(error.message)`
 * dropped both, so a 23505 could not be told from any other failure.
 */
export class ClaimListingError extends Error {
  readonly code: string | null;
  readonly details: string | null;

  constructor(source: { message: string; code?: string | null; details?: string | null }) {
    super(source.message);
    this.name = "ClaimListingError";
    this.code = source.code ?? null;
    this.details = source.details ?? null;
  }
}
