/**
 * Who may hold a Google Play subscription (WEB-SEC-050).
 *
 * validate-android-receipt upserted by user_id alone. It never asked whether
 * another account already held the purchase token, and never compared the
 * obfuscatedExternalAccountId the app sets at purchase, so one paid token
 * could unlock premium on every account that sent it.
 *
 * The rules, in order:
 *   - obfuscatedExternalAccountId present is proof. BillingService.kt sets it
 *     to the lowercase hex SHA-256 of the buyer's Supabase user id, so the
 *     caller must hash to it. A mismatch is a conflict whoever holds the row;
 *     a match is allowed even when another account holds the token, because
 *     that other account is the one without a claim.
 *   - Absent (purchases made before the id was set, or while signed out):
 *     the first account to validate keeps it, and any other caller is a
 *     conflict.
 *
 * Pure so it can be tested without Google or a database. Whether a conflict
 * is refused or only logged is the endpoint's call (ANDROID_OWNERSHIP_ENFORCE),
 * because refusing is a tightening of a shipped contract.
 */

export type GoogleOwnershipAction = 'allow' | 'conflict';

export type GoogleOwnershipReason =
  | 'owned_by_another_account'
  | 'account_id_mismatch';

export interface GoogleOwnershipInput {
  /** Lowercase hex SHA-256 of the authenticated caller's user id (see hashAccountId). */
  callerAccountHash: string;
  /** obfuscatedExternalAccountId from Google's purchase response, if the purchase set one. */
  obfuscatedExternalAccountId?: string | null;
  /** user_ids of OTHER accounts with a live Android row for the same purchase token. */
  otherActiveOwnerIds: string[];
}

export interface GoogleOwnershipDecision {
  action: GoogleOwnershipAction;
  reason?: GoogleOwnershipReason;
}

/** Same reason string iOS returns with its 409, so clients can share handling. */
export const OWNED_BY_ANOTHER_ACCOUNT = 'owned_by_another_account';
export const ACCOUNT_ID_MISMATCH = 'account_id_mismatch';

/**
 * The value BillingService.obfuscatedAccountId() sends: SHA-256 of the user
 * id's UTF-8 bytes, lowercase hex. Supabase user ids are lowercase UUIDs, and
 * the app hashes the id as the session returns it, so no case folding here.
 */
export async function hashAccountId(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function decideGoogleOwnership(input: GoogleOwnershipInput): GoogleOwnershipDecision {
  const caller = input.callerAccountHash.trim().toLowerCase();
  const claimed = (input.obfuscatedExternalAccountId ?? '').trim().toLowerCase();

  if (claimed) {
    if (claimed !== caller) {
      return { action: 'conflict', reason: ACCOUNT_ID_MISMATCH };
    }
    return { action: 'allow' };
  }

  if (input.otherActiveOwnerIds.length > 0) {
    return { action: 'conflict', reason: OWNED_BY_ANOTHER_ACCOUNT };
  }
  return { action: 'allow' };
}

/** ANDROID_OWNERSHIP_ENFORCE=true refuses conflicts; anything else only logs them. */
export function isOwnershipEnforced(value: string | undefined | null): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}
