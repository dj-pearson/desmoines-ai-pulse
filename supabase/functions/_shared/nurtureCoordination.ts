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
  const { data, error } = await supabase
    .from("nurture_sends")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", since)
    .not("status", "in", "(skipped,failed)")
    .limit(1);

  // FAIL CLOSED (WEB-BE-032 AC2). Callers skip the user when this returns true,
  // so a discarded error read as "no recent send" would send the email - a
  // transient read failure against nurture_sends would bypass the cross-agent
  // frequency cap for every user in the run, which is the one outcome this
  // ledger exists to prevent. Suppressing a send costs one cycle; overlapping
  // nurture and re-engagement mail costs a complaint.
  if (error) {
    console.warn(
      `[nurtureCoordination] recentlyMessaged read failed for ${userId}; suppressing send:`,
      error.message,
    );
    return true;
  }
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
  const { data, error } = await supabase
    .from("nurture_sends")
    .select("opened_at, clicked_at, activated_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .not("status", "in", "(skipped,failed)")
    .order("created_at", { ascending: false })
    .limit(maxAttempts);

  // FAIL CLOSED, same reasoning as recentlyMessaged: an empty result from a
  // discarded error is indistinguishable from "fewer than maxAttempts sends so
  // far", which returns false and keeps mailing someone who may have ignored
  // every previous attempt.
  if (error) {
    console.warn(
      `[nurtureCoordination] shouldAgeOut read failed for ${userId}/${kind}; ageing out:`,
      error.message,
    );
    return true;
  }
  const rows = (data ?? []) as { opened_at: string | null; clicked_at: string | null; activated_at: string | null }[];
  if (rows.length < maxAttempts) return false;
  return rows.every((r) => !r.opened_at && !r.clicked_at && !r.activated_at);
}
