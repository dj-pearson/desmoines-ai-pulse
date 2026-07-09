/**
 * agent edge-metrics (AOS-MAINT-007) — edge-function error-rate & cold-start
 * monitor.
 *
 * Every 6h, aggregates two windows (current 24h vs the prior 24h baseline):
 *   - edge_function_metrics — instrumented HTTP functions: 5xx (server) vs 4xx
 *     (user) rate + latency p95 + max (cold-start proxy).
 *   - automation_job_runs (ledger) — internal agent/cron functions: failure
 *     rate + run duration p95.
 * Opens a deduped tier-2 task per function that regresses on a SERVER signal
 * (5xx / failure rate over threshold, or p95 latency regression). High 4xx is
 * recorded as context but never alerts — it's user-caused, not a server bug.
 * The run summary (noisiest functions) is written to the ledger.
 *
 * Consolidated into `agent-runner` (was `agent-edge-metrics/index.ts`).
 */
import { createAgentTask } from "../agentTasks.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "edge-metrics-monitor";
const MIN_SAMPLES = 20; // don't alert on tiny samples
const ERROR_RATE_THRESHOLD = 0.1; // 10% server errors
const P95_MS_THRESHOLD = 2000; // slow if p95 over 2s
const P95_REGRESSION_FACTOR = 1.5; // and >= 1.5x the baseline

function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

interface Agg {
  total: number;
  serverErrors: number; // 5xx / failed runs
  clientErrors: number; // 4xx
  durations: number[];
}

function newAgg(): Agg {
  return { total: 0, serverErrors: 0, clientErrors: 0, durations: [] };
}

export const run: AgentRun = async (ctx, { supabase }) => {
  const now = Date.now();
  const cur0 = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const base0 = new Date(now - 48 * 60 * 60 * 1000).toISOString();

  // Per-function aggregates for current + baseline windows.
  const current = new Map<string, Agg>();
  const baseline = new Map<string, Agg>();
  const bump = (m: Map<string, Agg>, name: string): Agg => {
    let a = m.get(name);
    if (!a) { a = newAgg(); m.set(name, a); }
    return a;
  };

  // ── edge_function_metrics (instrumented HTTP functions) ──────────────
  const { data: metrics } = await supabase
    .from("edge_function_metrics")
    .select("function_name, status_class, duration_ms, created_at")
    .gte("created_at", base0)
    .limit(20000);
  for (const r of (metrics ?? []) as { function_name: string; status_class: string; duration_ms: number | null; created_at: string }[]) {
    const m = r.created_at >= cur0 ? current : baseline;
    const a = bump(m, r.function_name);
    a.total++;
    if (r.status_class === "5xx") a.serverErrors++;
    else if (r.status_class === "4xx") a.clientErrors++;
    if (r.duration_ms != null) a.durations.push(r.duration_ms);
  }

  // ── automation_job_runs (internal agent/cron functions) ──────────────
  const { data: runs } = await supabase
    .from("automation_job_runs")
    .select("agent_key, job_name, status, started_at, finished_at")
    .gte("started_at", base0)
    .limit(20000);
  for (const r of (runs ?? []) as { agent_key: string | null; job_name: string | null; status: string; started_at: string; finished_at: string | null }[]) {
    const name = r.agent_key || r.job_name || "unknown";
    const m = r.started_at >= cur0 ? current : baseline;
    const a = bump(m, name);
    a.total++;
    if (r.status === "failed" || r.status === "failure") a.serverErrors++;
    if (r.finished_at) {
      const d = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime();
      if (d >= 0) a.durations.push(d);
    }
  }

  // ── Regression detection (server signals only) ───────────────────────
  let opened = 0;
  const noisiest: { fn: string; serverErrors: number; errorRate: number; p95: number | null }[] = [];
  for (const [fn, cur] of current) {
    const errorRate = cur.total > 0 ? cur.serverErrors / cur.total : 0;
    const curP95 = p95(cur.durations);
    const base = baseline.get(fn);
    const baseP95 = base ? p95(base.durations) : null;
    const baseRate = base && base.total > 0 ? base.serverErrors / base.total : 0;

    noisiest.push({ fn, serverErrors: cur.serverErrors, errorRate: Math.round(errorRate * 100) / 100, p95: curP95 });

    const errorRegression = cur.total >= MIN_SAMPLES && errorRate >= ERROR_RATE_THRESHOLD && errorRate >= Math.max(baseRate, ERROR_RATE_THRESHOLD * 0.5);
    const latencyRegression =
      cur.total >= MIN_SAMPLES &&
      curP95 != null &&
      curP95 >= P95_MS_THRESHOLD &&
      (baseP95 == null || curP95 >= baseP95 * P95_REGRESSION_FACTOR);

    if (errorRegression || latencyRegression) {
      const reasons: string[] = [];
      if (errorRegression) reasons.push(`server error rate ${Math.round(errorRate * 100)}% (baseline ${Math.round(baseRate * 100)}%)`);
      if (latencyRegression) reasons.push(`p95 latency ${curP95}ms (baseline ${baseP95 ?? "n/a"}ms)`);
      const task = await createAgentTask(supabase, {
        agentKey: AGENT_KEY,
        category: "maintain",
        title: `Edge function regressed: ${fn} — ${reasons.join("; ")}`,
        confidence: 0,
        forceTier: 2,
        dedupeKey: `edge-regression:${fn}`,
        payload: {
          function: fn,
          samples: cur.total,
          serverErrorRate: Math.round(errorRate * 100) / 100,
          clientErrorRate: cur.total > 0 ? Math.round((cur.clientErrors / cur.total) * 100) / 100 : 0,
          p95Ms: curP95,
          baselineP95Ms: baseP95,
          coldStartProxyMs: cur.durations.length ? Math.max(...cur.durations) : null,
        },
      });
      if (task.ok) {
        opened++;
        ctx.escalated(1);
      }
    }
  }

  noisiest.sort((a, b) => b.serverErrors - a.serverErrors);
  const top = noisiest.slice(0, 5);

  ctx.processed((metrics?.length ?? 0) + (runs?.length ?? 0));
  ctx.summary(`edge metrics: ${current.size} functions; ${opened} regression task(s); noisiest ${top.map((t) => `${t.fn}(${t.serverErrors})`).join(", ") || "none"}`);
  ctx.meta({ functions: current.size, opened, noisiest: top });
  return { functions: current.size, opened, noisiest: top };
};
