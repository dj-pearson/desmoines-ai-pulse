/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (aggregates over automation_job_runs; no user data returned).
 *
 * agent-performance-review (AOS-MANAGE-007) - weekly OS self-review.
 *
 * automation_job_runs is already an agent-performance ledger: job_name,
 * started_at, finished_at, status, items_processed, items_failed, attempts,
 * error, agent_key, items_escalated, tokens_used, cost_usd, summary. This reads
 * it and says how the automation actually behaved.
 *
 * AC3 IS "SOURCED ONLY FROM REAL LEDGER DATA", AND HALF THE LEDGER IS UNWRITTEN.
 * Measured over the 277 rows present on 2026-08-29:
 *
 *     agent_key         populated on 1 row of 277
 *     items_escalated   0 on every row
 *     tokens_used       0 on every row
 *     cost_usd          0 on every row
 *
 * A column that is zero on every row is indistinguishable from a column nothing
 * writes, so reporting "$0.00 spent" or "0 escalations" would be inventing a
 * finding out of an absence. AC1 asks for auto-resolve-vs-escalation counts and
 * estimated hours/cost saved; those are declared UNSOURCED here rather than
 * printed as zeros, and the report says which column is empty and why that is
 * not the same as a quiet week. Same rule as executive-digest (AOS-MANAGE-001)
 * and the WEB-BE-032 fix before it.
 *
 * Grouping is by job_name, not agent_key, for the same reason: one populated row
 * in 277 cannot carry a per-category breakdown.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";
import { notifyOps } from "../_shared/notifyOps.ts";
import { composeDigest } from "../_shared/digestFormat.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

const SITE = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "https://desmoinesinsider.com")
  .replace(/\/+$/, "");
const DAY = 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

interface Run {
  job_name: string | null;
  status: string | null;
  items_processed: number | null;
  items_failed: number | null;
  items_escalated: number | null;
  tokens_used: number | null;
  cost_usd: number | null;
  attempts: number | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface JobStats {
  job: string;
  runs: number;
  succeeded: number;
  processed: number;
  failed: number;
  avgSeconds: number | null;
  lastError: string | null;
}

/** Per-job rollup. Exported for the tests; see _tests/agent-performance-review.test.ts. */
export function summarise(runs: Run[]): JobStats[] {
  const byJob = new Map<string, Run[]>();
  for (const r of runs) {
    const key = r.job_name ?? "(unnamed)";
    const list = byJob.get(key);
    if (list) list.push(r);
    else byJob.set(key, [r]);
  }
  const out: JobStats[] = [];
  for (const [job, list] of byJob) {
    const durations = list
      .map((r) =>
        r.started_at && r.finished_at
          ? (Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000
          : null,
      )
      .filter((n): n is number => n !== null && Number.isFinite(n));
    out.push({
      job,
      runs: list.length,
      succeeded: list.filter((r) => r.status === "success").length,
      processed: list.reduce((s, r) => s + (r.items_processed ?? 0), 0),
      failed: list.reduce((s, r) => s + (r.items_failed ?? 0), 0),
      avgSeconds:
        durations.length > 0
          ? Math.round((durations.reduce((s, n) => s + n, 0) / durations.length) * 10) / 10
          : null,
      lastError: list.find((r) => r.error)?.error ?? null,
    });
  }
  return out.sort((a, b) => b.runs - a.runs);
}

/**
 * A metric is only reportable if SOME row carries a non-zero value.
 *
 * All-zero and never-written look identical from here, and the difference is the
 * whole of AC3: "0 escalations this week" is a finding, "nothing has ever
 * written items_escalated" is a different one, and printing the first when the
 * second is true is fabrication.
 */
export function sourced(runs: Run[], field: "items_escalated" | "tokens_used" | "cost_usd"): boolean {
  return runs.some((r) => (r[field] ?? 0) !== 0);
}

export function reviewLines(runs: Run[], windowDays: number): string[] {
  const stats = summarise(runs);
  const lines: string[] = [];

  lines.push(`-- RUNS (${windowDays}d) --`);
  if (stats.length === 0) {
    lines.push("No automation runs in the window - UNAVAILABLE (nothing to review, or nothing is running)");
  }
  for (const s of stats) {
    const rate = s.runs === 0 ? 0 : Math.round((100 * s.succeeded) / s.runs);
    const dur = s.avgSeconds === null ? "n/a" : `${s.avgSeconds}s`;
    lines.push(
      `${s.job}: ${s.succeeded}/${s.runs} succeeded (${rate}%), ` +
        `${s.processed} processed, ${s.failed} failed, avg ${dur}`,
    );
  }

  // AC2's "flags any agent trending worse", reduced to the version this ledger
  // can actually support: a job that has never succeeded in the window is not a
  // trend, it is a broken job, and it is the only claim the data carries.
  const neverSucceeded = stats.filter((s) => s.runs > 0 && s.succeeded === 0);
  lines.push("-- NEVER SUCCEEDED IN THIS WINDOW --");
  if (neverSucceeded.length === 0) {
    lines.push("none");
  }
  for (const s of neverSucceeded) {
    lines.push(`${s.job}: 0 of ${s.runs} runs succeeded` + (s.lastError ? ` - ${s.lastError.slice(0, 160)}` : ""));
  }

  lines.push("-- NOT SOURCED --");
  const unsourced: string[] = [];
  if (!sourced(runs, "items_escalated")) unsourced.push("items_escalated");
  if (!sourced(runs, "tokens_used")) unsourced.push("tokens_used");
  if (!sourced(runs, "cost_usd")) unsourced.push("cost_usd");
  if (unsourced.length === 0) {
    lines.push("every ledger column carries data");
  } else {
    lines.push(
      `UNAVAILABLE: ${unsourced.join(", ")} are zero on every run in the window, ` +
        `so auto-resolve-vs-escalation counts and hours/cost saved cannot be reported. ` +
        `Zero everywhere is indistinguishable from a column nothing writes - not the same as a quiet week.`,
    );
  }

  lines.push("-- WHERE TO LOOK --", `${SITE}/admin/agents`);
  return lines;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const cors = getCorsHeaders(req.headers.get("origin") ?? undefined);
  const denied = await requireAdminOrApiKey(req, cors);
  if (denied) return denied;

  let windowDays = 7;
  try {
    const body = await req.json();
    if (body && typeof body.windowDays === "number" && body.windowDays > 0 && body.windowDays <= 90) {
      windowDays = Math.floor(body.windowDays);
    }
  } catch {
    // no body, or not JSON - weekly is the default, and is what {manual:true} gets
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const result = await runJob("agent-performance-review", async (ctx) => {
    const since = new Date(Date.now() - windowDays * DAY).toISOString();
    const { data, error } = await supabase
      .from("automation_job_runs")
      .select(
        "job_name,status,items_processed,items_failed,items_escalated,tokens_used,cost_usd,attempts,error,started_at,finished_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    // A read failure must not render as "no runs", which would report a healthy
    // silence over a broken query - the failure this whole family of reports
    // exists to avoid.
    if (error) throw new Error(`automation_job_runs read failed: ${error.message}`);

    const runs = (data ?? []) as Run[];
    const stats = summarise(runs);
    const broken = stats.filter((s) => s.runs > 0 && s.succeeded === 0);
    const { body, degraded } = composeDigest(reviewLines(runs, windowDays));

    ctx.processed(runs.length);
    ctx.failed(broken.length);
    ctx.meta({
      window_days: windowDays,
      runs: runs.length,
      jobs: stats.length,
      never_succeeded: broken.map((s) => s.job),
      degraded_sections: degraded,
    });

    await notifyOps(supabase, {
      severity: broken.length > 0 ? "medium" : "low",
      title: `Agent performance review (${windowDays}d): ${broken.length} job(s) never succeeded`,
      body,
      dedupeKey: `agent-performance-review:${windowDays}d`,
      capWindowMs: windowDays * DAY,
    });

    return { windowDays, runs: runs.length, jobs: stats.length, neverSucceeded: broken.map((s) => s.job) };
  });

  return json(result, result.ok ? 200 : 500, cors);
});
