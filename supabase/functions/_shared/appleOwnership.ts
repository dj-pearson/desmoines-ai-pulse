/**
 * Who may hold an Apple subscription (IOS-DD-MONETIZATION-02).
 *
 * validate-ios-receipt used to store the client's originalTransactionId and
 * only check that the body's userId matched the caller. One App Store
 * subscription could therefore unlock every account that signed in on the
 * device (or that was handed the transaction id), and a refund notification,
 * which looked the transaction up with .maybeSingle(), then errored on the
 * duplicate rows and revoked nothing.
 *
 * The rules, in order:
 *   - appAccountToken present (set at purchase since this change) is proof:
 *     it names the owning account. A different caller is refused; the owner
 *     binds, taking the row back from anyone else holding it.
 *   - No token (purchases made before the token, or while signed out): the
 *     first account to validate keeps it. Another account can take it over
 *     only on an explicit Restore, which is a deliberate user action.
 *
 * Pure so it can be tested without Apple or a database.
 */

export type AppleOwnershipAction = 'bind' | 'transfer' | 'refuse';

export interface AppleOwnershipInput {
  /** The authenticated caller's user id. */
  callerId: string;
  /** appAccountToken from Apple's signed transaction, if the purchase set one. */
  appAccountToken?: string | null;
  /** user_ids of OTHER accounts with a live iOS row for the same original transaction. */
  otherActiveOwnerIds: string[];
  /** True only when the client sent `transfer: true` (the Restore button). */
  transferRequested: boolean;
}

export interface AppleOwnershipDecision {
  action: AppleOwnershipAction;
  reason?: string;
}

export const OWNED_BY_ANOTHER_ACCOUNT = 'owned_by_another_account';

export function decideAppleOwnership(input: AppleOwnershipInput): AppleOwnershipDecision {
  const caller = input.callerId.trim().toLowerCase();
  const token = (input.appAccountToken ?? '').trim().toLowerCase();
  const othersPresent = input.otherActiveOwnerIds.length > 0;

  if (token) {
    if (token !== caller) {
      return { action: 'refuse', reason: OWNED_BY_ANOTHER_ACCOUNT };
    }
    return { action: othersPresent ? 'transfer' : 'bind' };
  }

  if (!othersPresent) return { action: 'bind' };
  if (input.transferRequested) return { action: 'transfer' };
  return { action: 'refuse', reason: OWNED_BY_ANOTHER_ACCOUNT };
}
