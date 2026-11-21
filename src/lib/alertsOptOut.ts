/**
 * WEB-FEAT-073: the one-click "turn off saved-search alerts" link in
 * a saved-search alert email (/unsubscribe?alerts=<saved_searches.id>).
 *
 * disable_event_alerts_by_token turns off the recipient's event alerts (the
 * master switch on /dashboard?tab=saved-searches) and nothing else: the
 * newsletter, their saved searches and every other email stay. No sign-in
 * needed. It is not in the generated types until migration 20261108000098 is
 * applied, so the call goes through a narrowed signature
 * (scripts/check-schema-usage.mjs lists it in PENDING_MIGRATIONS).
 */
import { supabase } from "@/integrations/supabase/client";

export type AlertsOptOutResult =
  | { kind: "disabled"; alreadyDisabled: boolean }
  | { kind: "invalid" }
  | { kind: "error"; error: unknown };

interface DisableRow {
  success?: boolean;
  already_disabled?: boolean | null;
}

type DisableRpc = (
  fn: "disable_event_alerts_by_token",
  args: { p_token: string },
) => PromiseLike<{ data: DisableRow[] | DisableRow | null; error: unknown }>;

export async function disableAlertsByToken(token: string): Promise<AlertsOptOutResult> {
  const trimmed = token.trim();
  if (!trimmed) return { kind: "invalid" };
  try {
    // bind: rpc reads this.rest, so a detached reference throws.
    const rpc = supabase.rpc.bind(supabase) as unknown as DisableRpc;
    const { data, error } = await rpc("disable_event_alerts_by_token", { p_token: trimmed });
    if (error) return { kind: "error", error };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return { kind: "invalid" };
    return { kind: "disabled", alreadyDisabled: !!row.already_disabled };
  } catch (error) {
    return { kind: "error", error };
  }
}
