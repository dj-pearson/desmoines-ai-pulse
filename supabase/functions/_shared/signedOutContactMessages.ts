/**
 * Contact-form messages sent while signed out, for account erasure
 * (WEB-LEGAL-015, owner decision 2026-11-22).
 *
 * A message sent signed in carries user_id and goes with the account through
 * ON DELETE CASCADE (20261122000060). A message sent signed out has no user_id,
 * only the address the person typed, so nothing keyed by user_id reaches it.
 * The account-deletion page used to tell people to email us for those. They
 * are now deleted with the account when the address matches the account's,
 * compared case-insensitively (lower(email) = lower(account email)), by the
 * service-role-only RPC delete_signed_out_contact_submissions
 * (20261122000070). The comparison runs in Postgres rather than through a
 * PostgREST ilike filter, where '_' and '%' in an address are wildcards.
 *
 * It needs the address, so delete-user-account calls it before the auth user
 * is removed. A failed call is returned as a failure, never dropped: the
 * caller reports it in tables_incomplete and complete:false.
 *
 * Messages a signed-in user sent are not touched here: a row with a user_id
 * belongs to that account, which may be someone else's who typed this address.
 */

import type { TableFailure } from "./addressKeyedData.ts";

export const SIGNED_OUT_CONTACT_RPC = "delete_signed_out_contact_submissions";

interface RpcError {
  code?: string;
  message: string;
}

/** The slice of the Supabase client this needs. Narrow on purpose. */
export interface ContactPurgeClient {
  rpc(
    fn: string,
    args: { p_email: string },
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

export interface ContactPurgeResult {
  /** Whether the delete was attempted; false only when the account has no address. */
  attempted: boolean;
  /** Rows deleted, when the RPC reported a count. */
  deleted: number | null;
  failure: TableFailure | null;
}

export async function purgeSignedOutContactMessages(
  client: ContactPurgeClient,
  email: string | null | undefined,
): Promise<ContactPurgeResult> {
  const address = (email ?? "").trim();
  if (address.length === 0) {
    // A phone-only account has no address to match. Nothing was skipped.
    return { attempted: false, deleted: null, failure: null };
  }
  try {
    const { data, error } = await client.rpc("delete_signed_out_contact_submissions", { p_email: address });
    if (error) {
      return {
        attempted: true,
        deleted: null,
        failure: { table: "contact_submissions", code: error.code, message: error.message },
      };
    }
    return { attempted: true, deleted: typeof data === "number" ? data : null, failure: null };
  } catch (e) {
    return {
      attempted: true,
      deleted: null,
      failure: { table: "contact_submissions", message: e instanceof Error ? e.message : String(e) },
    };
  }
}
