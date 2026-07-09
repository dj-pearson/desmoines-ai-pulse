/**
 * nurtureCoordination — cross-agent send coordination (AOS-NURTURE-005).
 *
 * Every nurture agent records to the shared nurture_sends ledger, so "has this
 * user been messaged by ANY nurture agent recently?" is a single query against
 * it. Re-engagement uses this so a dormant user never gets overlapping nurture
 * + re-engagement in the same window.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAY = 24 * 60 * 60 * 1000;

/** True if the user got any real (non-skipped/failed) nurture send in the window. */
export async function recentlyMessaged(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  windowDays: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowDays * DAY).toISOString();
  const { data } = await supabase
    .from("nurture_sends")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", since)
    .not("status", "in", "(skipped,failed)")
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * Age-out check: has the user ignored the last `maxAttempts` sends of `kind`
 * (no open, click, or activation)? Repeatedly-unresponsive users are suppressed
 * to avoid spam.
 */
export async function shouldAgeOut(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  kind: string,
  maxAttempts: number,
): Promise<boolean> {
  const { data } = await supabase
    .from("nurture_sends")
    .select("opened_at, clicked_at, activated_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .not("status", "in", "(skipped,failed)")
    .order("created_at", { ascending: false })
    .limit(maxAttempts);
  const rows = (data ?? []) as { opened_at: string | null; clicked_at: string | null; activated_at: string | null }[];
  if (rows.length < maxAttempts) return false;
  return rows.every((r) => !r.opened_at && !r.clicked_at && !r.activated_at);
}
