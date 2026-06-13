/**
 * web-vitals-rollup (WEB-PERF-007)
 *
 * Weekly job: computes p75 per metric per page-group over the trailing 7 days
 * and the prior 7 days, upserts web_vitals_weekly, emails the admin when any
 * metric regresses > 20% week-over-week OR breaches its Core-Web-Vitals budget,
 * and prunes raw samples older than 90 days.
 *
 * Auth: requireAdminOrApiKey (cron service-role bearer + admin re-run JWT pass).
 * Runs under the default verify_jwt=true gateway — NOT in config.toml (matches
 * the data-quality-heal / dedupe-content precedent). Wrapped in the WEB-AUTO-001
 * jobRunner for Job Health observability.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob, sendJobAlert } from "../_shared/jobRunner.ts";

// Core Web Vitals budgets (CLAUDE.md quality standards). TTFB/FCP are tracked
// for trend but have no hard budget alert (per the story's acceptance criteria).
const BUDGETS: Record<string, number> = { LCP: 2500, INP: 200, CLS: 0.1 };
const REGRESSION_PCT = 20; // alert if p75 worsens by more than this week-over-week
const SAMPLE_RETENTION_DAYS = 90;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface P75Row {
  page_group: string;
  metric: string;
  p75: number;
  sample_count: number;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") ?? undefined);

  const fail = await requireAdminOrApiKey(req, corsHeaders);
  if (fail) return fail;

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(url, key);

  const job = await runJob("web-vitals-rollup", async (ctx) => {
    const now = Date.now();
    const curSince = new Date(now - WEEK_MS);
    const prevSince = new Date(now - 2 * WEEK_MS);
    const until = new Date(now);
    const weekStart = curSince.toISOString().slice(0, 10); // UTC date

    const [{ data: curData, error: curErr }, { data: prevData, error: prevErr }] =
      await Promise.all([
        supabase.rpc("get_web_vitals_p75", {
          p_since: curSince.toISOString(),
          p_until: until.toISOString(),
        }),
        supabase.rpc("get_web_vitals_p75", {
          p_since: prevSince.toISOString(),
          p_until: curSince.toISOString(),
        }),
      ]);
    if (curErr) throw new Error(`p75 (current) failed: ${curErr.message}`);
    if (prevErr) throw new Error(`p75 (prior) failed: ${prevErr.message}`);

    const current = (curData ?? []) as P75Row[];
    const prior = (prevData ?? []) as P75Row[];
    const prevMap = new Map<string, number>();
    for (const r of prior) prevMap.set(`${r.page_group}:${r.metric}`, Number(r.p75));

    const regressions: string[] = [];
    const rows = current.map((r) => {
      const p75 = Number(r.p75);
      const prevP75 = prevMap.get(`${r.page_group}:${r.metric}`) ?? null;
      const pctChange =
        prevP75 != null && prevP75 > 0 ? ((p75 - prevP75) / prevP75) * 100 : null;
      const budget = BUDGETS[r.metric];
      const breachesBudget = budget != null && p75 > budget;

      // Higher is worse for every web vital — a positive pctChange is a regression.
      if (pctChange != null && pctChange > REGRESSION_PCT) {
        regressions.push(
          `${r.page_group} · ${r.metric}: ${fmt(r.metric, p75)} (was ${fmt(r.metric, prevP75!)}, +${pctChange.toFixed(0)}%)`,
        );
      } else if (breachesBudget) {
        regressions.push(
          `${r.page_group} · ${r.metric}: ${fmt(r.metric, p75)} exceeds budget ${fmt(r.metric, budget!)}`,
        );
      }

      return {
        week_start: weekStart,
        page_group: r.page_group,
        metric: r.metric,
        p75,
        sample_count: Number(r.sample_count) || 0,
        prev_p75: prevP75,
        pct_change: pctChange,
        breaches_budget: breachesBudget,
      };
    });

    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from("web_vitals_weekly")
        .upsert(rows, { onConflict: "week_start,page_group,metric" });
      if (upErr) throw new Error(`weekly upsert failed: ${upErr.message}`);
    }

    // Prune old raw samples (best-effort; failure shouldn't fail the rollup).
    let pruned = 0;
    try {
      const cutoff = new Date(now - SAMPLE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("web_vitals_samples")
        .delete({ count: "exact" })
        .lt("created_at", cutoff);
      pruned = count ?? 0;
    } catch (e) {
      console.error("web-vitals-rollup prune failed:", e instanceof Error ? e.message : e);
    }

    ctx.processed(rows.length);
    ctx.meta({ weekStart, groups: rows.length, regressions: regressions.length, pruned });

    // A regression is NOT a job failure (don't throw — that would retry + mark
    // the run failed). Alert separately so the run still records as success.
    if (regressions.length > 0) {
      await sendJobAlert(
        "web-vitals-rollup",
        `Web Vitals regression detected (week of ${weekStart}):\n\n- ${regressions.join("\n- ")}`,
      );
    }

    return { weekStart, groups: rows.length, regressions, pruned };
  });

  return new Response(JSON.stringify(job), {
    status: job.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function fmt(metric: string, v: number): string {
  return metric === "CLS" ? v.toFixed(3) : `${Math.round(v)}ms`;
}
