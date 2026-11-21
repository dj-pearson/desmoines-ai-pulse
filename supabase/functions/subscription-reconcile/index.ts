/**
 * subscription-reconcile (WEB-BE-062)
 *
 * Daily. Re-reads from Stripe every web subscription whose row still says
 * active, trialing or past_due after its current_period_end, and writes
 * Stripe's answer when it differs. One subscription_events row per correction.
 * The rules, including what happens when Stripe cannot answer, are in
 * _shared/subscriptionReconcile.ts; in short, an error writes nothing and the
 * time bound in public.subscription_row_entitled ends entitlement on its own.
 *
 * Reported through runJob into automation_job_runs: items_processed is rows
 * checked, items_failed is rows it could not decide on, and metadata carries
 * `corrected`, the per-outcome counts and the per-platform backlog. The admin
 * Job health panel shows the corrected count from that metadata.
 *
 * Body (optional): { "batchSize": 1-200 } (default 50).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";
import type { PlanPriceRow } from "../_shared/stripeSubscriptionRow.ts";
import {
  failedCount,
  parseBatchSize,
  type ReconcileCandidate,
  reconcileBatch,
  type ReconcileStore,
} from "../_shared/subscriptionReconcile.ts";

const JOB = "subscription-reconcile";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  let body: { batchSize?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // An empty body is the cron default; keep the defaults.
  }
  const batchSize = parseBatchSize(body?.batchSize);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const result = await runJob(JOB, async (ctx) => {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      // Not "0 corrected": with no key nothing could be checked.
      throw new Error("STRIPE_SECRET_KEY is not set; no subscription could be checked");
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const { data: backlog, error: backlogError } = await supabase.rpc("subscription_reconcile_backlog");
    if (backlogError) throw new Error(`could not count the backlog: ${backlogError.message}`);

    const { data: rows, error: candidatesError } = await supabase.rpc("subscription_reconcile_candidates", {
      p_limit: batchSize,
    });
    if (candidatesError) throw new Error(`could not read candidates: ${candidatesError.message}`);

    const { data: catalog, error: catalogError } = await supabase
      .from("subscription_plans")
      .select("id, stripe_price_id_monthly, stripe_price_id_yearly");
    // Without the catalogue a plan change could not be resolved, and a patch
    // without plan_id would leave a paid upgrade on the old tier.
    if (catalogError) throw new Error(`could not read subscription_plans: ${catalogError.message}`);

    const store: ReconcileStore = {
      async apply(candidate, patch, details) {
        const { data, error } = await supabase.rpc("apply_subscription_reconciliation", {
          p_subscription_id: candidate.id,
          p_stripe_subscription_id: candidate.stripe_subscription_id,
          p_patch: patch,
          p_details: details,
        });
        if (error) throw new Error(error.message);
        return data === true;
      },
      async note(subscriptionId, outcome, detail) {
        const { error } = await supabase.rpc("note_subscription_reconcile_check", {
          p_subscription_id: subscriptionId,
          p_outcome: outcome,
          p_detail: detail,
        });
        if (error) throw new Error(error.message);
      },
    };

    const report = await reconcileBatch((rows ?? []) as ReconcileCandidate[], {
      stripe: { retrieve: (id: string) => stripe.subscriptions.retrieve(id) },
      store,
      catalog: (catalog ?? []) as PlanPriceRow[],
    });

    ctx.processed(report.checked);
    ctx.failed(failedCount(report));
    ctx.meta({
      corrected: report.corrected,
      checked: report.checked,
      batchSize,
      outcomes: report.outcomes,
      backlog: backlog ?? [],
      corrections: report.corrections.map((c) => ({
        subscriptionId: c.subscriptionId,
        before: c.before,
        after: c.after,
      })),
      problems: report.problems,
      noteFailures: report.noteFailures,
      computedAt: new Date().toISOString(),
    });
    return {
      checked: report.checked,
      corrected: report.corrected,
      outcomes: report.outcomes,
    };
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({ success: false, error: result.error ?? "subscription reconcile failed", runId: result.runId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ success: true, status: result.status, runId: result.runId, ...(result.result ?? {}) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
