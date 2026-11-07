/**
 * Who gets an event submission's decision mail (WEB-SEC-041).
 *
 * contact_email is whatever the submitter typed into a free-text field. Using
 * it as the `to:` address let anyone with an account file a submission with a
 * victim's address and a title of their choosing, then have the site mail
 * "Update on your event <their text>" to that victim from the site's domain
 * the moment an admin or the triage function decided it.
 *
 * The decision now goes only to the address of the account that submitted,
 * and only when Supabase Auth says that address is confirmed. contact_email
 * is still shown to the admin in the "new submission" mail and is still the
 * address on the public listing; it just never decides who is mailed.
 *
 * Pure so it can be tested without a Supabase client.
 */

/** The fields of an auth.users row this needs (from auth.admin.getUserById). */
export interface SubmissionOwner {
  email?: string | null;
  email_confirmed_at?: string | null;
}

export type DecisionRecipient =
  | { to: string; reason: "owner_verified"; contactEmailMatches: boolean }
  | {
    to: null;
    reason: "no_owner" | "owner_not_found" | "owner_no_email" | "owner_unverified";
    contactEmailMatches: false;
  };

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function chooseDecisionRecipient(input: {
  /** user_submitted_events.user_id */
  ownerId: string | null | undefined;
  /** The owner's auth user, or null when the lookup found none or failed. */
  owner: SubmissionOwner | null | undefined;
  /** user_submitted_events.contact_email, only compared, never used as `to`. */
  contactEmail: string | null | undefined;
}): DecisionRecipient {
  if (!input.ownerId) return { to: null, reason: "no_owner", contactEmailMatches: false };
  if (!input.owner) return { to: null, reason: "owner_not_found", contactEmailMatches: false };

  const ownerEmail = (input.owner.email ?? "").trim();
  if (!ownerEmail) return { to: null, reason: "owner_no_email", contactEmailMatches: false };
  if (!input.owner.email_confirmed_at) {
    return { to: null, reason: "owner_unverified", contactEmailMatches: false };
  }

  const contact = normalizeEmail(input.contactEmail);
  return {
    to: ownerEmail,
    reason: "owner_verified",
    contactEmailMatches: contact !== "" && contact === normalizeEmail(ownerEmail),
  };
}
