/**
 * business-claims-health (WEB-ADS-047)
 *
 * Daily (13:23 UTC, migration 20261121000090). Counts pending business claims
 * and alerts the admin when any has waited more than 3 days. Most claims go
 * pending (an owner on a gmail address cannot verify by domain), and before
 * this the only way to learn one was waiting was to open
 * /admin/business-claims.
 *
 * The counts go into the run's metadata in automation_job_runs (runJob). A
 * failed read throws, so the run is recorded as FAILED and runJob alerts; it is
 * never reported as zero pending.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob, sendJobAlert } from "../_shared/jobRunner.ts";
import { getSiteUrl } from "../_shared/siteUrl.ts";
import {
  overdueClaims,
  PENDING_ALERT_DAYS,
  type PendingClaimRow,
  pendingClaimsAlert,
} from "../_shared/businessClaims.ts";

const JOB = "business-claims-health";

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

  const result = await runJob(JOB, async (ctx) => {
    const now = new Date();
    // The queue is small (one row per unreviewed claim), so the rows are read
    // whole and the count is their length: one query, and the count and the
    // overdue list cannot disagree.
    const { data, error } = await supabase
      .from("business_claims")
      .select("id, listing_type, listing_id, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) throw new Error(`could not read pending business claims: ${error.message}`);

    const pending = (data ?? []) as PendingClaimRow[];
    const overdue = overdueClaims(pending, now);
    const alert = pendingClaimsAlert(pending.length, overdue, now, getSiteUrl());
    if (alert) await sendJobAlert(JOB, alert);

    ctx.processed(pending.length);
    ctx.meta({
      pending: pending.length,
      overdue: overdue.length,
      alertAfterDays: PENDING_ALERT_DAYS,
      oldestPendingAt: pending[0]?.created_at ?? null,
      alerted: !!alert,
      computedAt: now.toISOString(),
    });
    return { pending: pending.length, overdue: overdue.length, alerted: !!alert };
  }, { exemptFromPause: true });

  if (!result.ok) {
    return new Response(
      JSON.stringify({ success: false, error: result.error ?? "business claims health failed", runId: result.runId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ success: true, runId: result.runId, ...(result.result ?? {}) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
