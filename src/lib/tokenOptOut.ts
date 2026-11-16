/**
 * The /unsubscribe page's two token links that are not the newsletter's.
 *
 *   ?account=<token>   WEB-ADS-035. A member with no newsletter row gets their
 *     own token (marketing_unsubscribe_tokens). marketing_unsubscribe_by_token
 *     writes the same 'unsubscribe' suppression as the newsletter link, so it
 *     stops every marketing email to that address.
 *   ?outreach=<token>  AOS-PROSPECT-009. A crm_leads prospect's token.
 *     outreach_unsubscribe_by_token stops partnership outreach to that address
 *     and leaves the newsletter and account email alone.
 *
 * email-unsubscribe's GET already 303s to these URLs; until this page read
 * them, both landed on "invalid or expired". Neither RPC is in the generated
 * types until migrations 20261108000104 and 20261115000101 are applied, so the
 * call goes through a narrowed signature (scripts/check-schema-usage.mjs lists
 * both in PENDING_MIGRATIONS). Both share newsletter_unsubscribe_by_token's
 * return shape: (success, already_unsubscribed).
 */
import { supabase } from "@/integrations/supabase/client";

export type TokenOptOutResult =
  | { kind: "unsubscribed"; alreadyUnsubscribed: boolean }
  | { kind: "invalid" }
  | { kind: "error"; error: unknown };

export type TokenOptOutRpc = "marketing_unsubscribe_by_token" | "outreach_unsubscribe_by_token";

interface UnsubscribeRow {
  success?: boolean;
  already_unsubscribed?: boolean | null;
}

type UnsubscribeRpc = (
  fn: TokenOptOutRpc,
  args: { p_token: string },
) => PromiseLike<{ data: UnsubscribeRow[] | UnsubscribeRow | null; error: unknown }>;

async function unsubscribeByToken(fn: TokenOptOutRpc, token: string): Promise<TokenOptOutResult> {
  const trimmed = token.trim();
  if (!trimmed) return { kind: "invalid" };
  try {
    // bind: rpc reads this.rest, so a detached reference throws.
    const rpc = supabase.rpc.bind(supabase) as unknown as UnsubscribeRpc;
    const { data, error } = await rpc(fn, { p_token: trimmed });
    if (error) return { kind: "error", error };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return { kind: "invalid" };
    return { kind: "unsubscribed", alreadyUnsubscribed: !!row.already_unsubscribed };
  } catch (error) {
    return { kind: "error", error };
  }
}

export function unsubscribeAccountByToken(token: string): Promise<TokenOptOutResult> {
  return unsubscribeByToken("marketing_unsubscribe_by_token", token);
}

export function unsubscribeOutreachByToken(token: string): Promise<TokenOptOutResult> {
  return unsubscribeByToken("outreach_unsubscribe_by_token", token);
}
