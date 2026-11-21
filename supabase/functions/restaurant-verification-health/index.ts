/**
 * restaurant-verification-health (WEB-AUTO-019)
 *
 * Nightly. Counts how many live restaurant listings Google has confirmed
 * recently and alerts the admin when closure detection looks stopped:
 *   - restaurants total (not merged, not closed)
 *   - verified within 30 days, unverified over 45 days, never checked
 *   - closure reviews open more than 14 days
 * The counts go into the run's metadata in automation_job_runs (runJob), which
 * is what the admin closure-reviews screen reads, with the run's date.
 *
 * A failed count throws: the run is recorded as FAILED and runJob alerts. It
 * is never reported as zero.
 *
 * Threshold: system_settings row setting_type 'restaurant_verification_health',
 * settings.max_unverified_share (0-1, default 0.25).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob, sendJobAlert } from "../_shared/jobRunner.ts";
import {
  checkedBeforeFilter,
  daysAgo,
  evaluateVerificationHealth,
  NEVER_CHECKED_FILTER,
  parseMaxUnverifiedShare,
  posterSkipStreak,
  POSTER_SKIP_STREAK,
  type VerificationCounts,
  verifiedSinceFilter,
} from "../_shared/restaurantVerificationHealth.ts";

const JOB = "restaurant-verification-health";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Live listings only: merged duplicates and closed places need no check.
  // deno-lint-ignore no-explicit-any
  const live = (q: any) =>
    q.not("is_merged", "is", true).not("status", "in", "(closed,permanently_closed,closed_permanently)");

  async function count(label: string, extra: string | null): Promise<number> {
    let q = live(supabase.from("restaurants").select("id", { count: "exact", head: true }));
    if (extra) q = q.or(extra);
    const { count: n, error } = await q;
    if (error || typeof n !== "number") {
      throw new Error(`could not count ${label}: ${error?.message ?? "no count returned"}`);
    }
    return n;
  }

  const result = await runJob(JOB, async (ctx) => {
    const now = new Date();
    const counts: VerificationCounts = {
      total: await count("restaurants", null),
      verifiedWithin30Days: await count("verified within 30 days", verifiedSinceFilter(daysAgo(30, now))),
      unverifiedOver45Days: await count("unverified over 45 days", checkedBeforeFilter(daysAgo(45, now))),
      neverChecked: await count("never checked", NEVER_CHECKED_FILTER),
      openReviewsOver14Days: 0,
    };

    const { count: reviews, error: reviewsError } = await supabase
      .from("restaurant_closure_reviews")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .lt("created_at", daysAgo(14, now));
    if (reviewsError || typeof reviews !== "number") {
      throw new Error(`could not count open closure reviews: ${reviewsError?.message ?? "no count returned"}`);
    }
    counts.openReviewsOver14Days = reviews;

    const { data: settingsRow, error: settingsError } = await supabase
      .from("system_settings")
      .select("settings")
      .eq("setting_type", "restaurant_verification_health")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (settingsError) throw new Error(`could not read its threshold: ${settingsError.message}`);
    const maxShare = parseMaxUnverifiedShare(
      (settingsRow?.settings as { max_unverified_share?: unknown } | null)?.max_unverified_share,
    );

    const { data: posterRuns, error: posterError } = await supabase
      .from("automation_job_runs")
      .select("metadata")
      .eq("job_name", "social-daily-poster")
      .eq("status", "success")
      .order("started_at", { ascending: false })
      .limit(POSTER_SKIP_STREAK);
    if (posterError) throw new Error(`could not read social-daily-poster runs: ${posterError.message}`);
    const posterSkipped = posterSkipStreak(posterRuns ?? []);

    const alerts = evaluateVerificationHealth(counts, maxShare, posterSkipped);
    for (const message of alerts) await sendJobAlert(JOB, message);

    ctx.processed(counts.total);
    ctx.meta({ counts, maxUnverifiedShare: maxShare, posterSkipped, alerts, computedAt: now.toISOString() });
    return { counts, alerts };
  }, { exemptFromPause: true });

  if (!result.ok) {
    return new Response(
      JSON.stringify({ success: false, error: result.error ?? "verification health failed", runId: result.runId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ success: true, runId: result.runId, ...(result.result ?? {}) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
