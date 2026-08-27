/**
 * SECURITY: verify_jwt = false
 * Reason: CI-invoked ingest + cron analysis; auth via requireAdminOrApiKey per
 *   WEB-SEC-001 (the ci-health-report workflow posts with EDGE_FUNCTION_API_KEY).
 * Risk level: LOW (records CI outcomes, opens review tasks).
 *
 * agent-ci-health (AOS-DEV-005) — flaky-test + CI-health watcher.
 *
 *   { mode: 'ingest', workflow, conclusion, duration_s, branch, head_sha,
 *     run_id, flaky_count } -> store a ci_runs row (from workflow_run CI).
 *   { mode: 'analyze' }     -> per-workflow flakiness + duration/failure-rate
 *                              regression analysis (cron). Flaky/regressed
 *                              workflows open a deduped tier-2 task + ops alert.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

const AGENT_KEY = "ci-health-watcher";
const RECENT = 25; // runs per workflow to consider

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

interface Run { workflow: string; conclusion: string; duration_s: number | null; flaky_count: number; created_at: string; }

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabase: Client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const mode = body.mode as string | undefined;

  try {
    if (mode === "ingest") {
      const workflow = String(body.workflow ?? "").slice(0, 120);
      if (!workflow) return json({ error: "workflow required" }, 400, corsHeaders);
      await supabase.from("ci_runs").insert({
        workflow,
        conclusion: String(body.conclusion ?? "unknown").slice(0, 40),
        duration_s: Number.isFinite(body.duration_s) ? Math.round(body.duration_s) : null,
        branch: body.branch ? String(body.branch).slice(0, 120) : null,
        head_sha: body.head_sha ? String(body.head_sha).slice(0, 60) : null,
        run_id: body.run_id ? String(body.run_id).slice(0, 40) : null,
        flaky_count: Number.isFinite(body.flaky_count) ? Math.max(0, Math.round(body.flaky_count)) : 0,
      });
      return json({ ok: true }, 200, corsHeaders);
    }

    if (mode === "analyze") {
      const ledger = await runAgent(AGENT_KEY, async (ctx) => {
        const { data: rows, error: rowsError } = await supabase
          .from("ci_runs")
          .select("workflow, conclusion, duration_s, flaky_count, created_at")
          .gte("created_at", new Date(Date.now() - 14 * 86400_000).toISOString())
          .order("created_at", { ascending: false })
          .limit(2000);
        // WEB-BE-032. THE work list. A dropped error reported every workflow as
        // healthy because there was nothing to judge, which is what a CI health
        // watcher must never do quietly.
        if (rowsError) throw new Error(`ci-health: ci_runs read failed: ${rowsError.message}`);

        // Group by workflow (most-recent first).
        const byWf = new Map<string, Run[]>();
        for (const r of (rows ?? []) as Run[]) {
          if (!byWf.has(r.workflow)) byWf.set(r.workflow, []);
          const arr = byWf.get(r.workflow)!;
          if (arr.length < RECENT) arr.push(r);
        }

        const flaky: string[] = [];
        const regressions: string[] = [];
        for (const [wf, runs] of byWf) {
          if (runs.length < 5) continue;
          const failures = runs.filter((r) => r.conclusion === "failure").length;
          const failRate = failures / runs.length;
          const flakySum = runs.reduce((s, r) => s + (r.flaky_count ?? 0), 0);

          // Flaky: reported flakes, or a mixed pass/fail rate (not a clean break).
          if (flakySum > 0 || (failRate >= 0.1 && failRate <= 0.6)) {
            flaky.push(`${wf} (fail ${(failRate * 100).toFixed(0)}%, flakes ${flakySum})`);
            await createAgentTask(supabase, {
              agentKey: AGENT_KEY,
              category: "dev",
              title: `Flaky CI: ${wf} (${(failRate * 100).toFixed(0)}% fail, ${flakySum} flakes)`,
              confidence: 0,
              forceTier: 2,
              dedupeKey: `flaky:${wf}`,
              payload: { workflow: wf, failRate, flakySum, runs: runs.length, note: "quarantine/annotate the non-deterministic test and fix" },
            });
          }

          // Duration regression: recent half vs older half.
          const durs = runs.map((r) => r.duration_s).filter((d): d is number => typeof d === "number");
          if (durs.length >= 8) {
            const half = Math.floor(durs.length / 2);
            const recentAvg = durs.slice(0, half).reduce((a, b) => a + b, 0) / half;
            const olderAvg = durs.slice(half).reduce((a, b) => a + b, 0) / (durs.length - half);
            if (olderAvg > 0 && recentAvg > olderAvg * 1.5) {
              regressions.push(`${wf} duration +${(((recentAvg / olderAvg) - 1) * 100).toFixed(0)}%`);
            }
          }
        }

        if (flaky.length > 0 || regressions.length > 0) {
          await notifyOps(supabase, {
            severity: regressions.length > 0 ? "high" : "medium",
            title: `CI health: ${flaky.length} flaky, ${regressions.length} regression(s)`,
            body: [...flaky.map((f) => `flaky: ${f}`), ...regressions.map((r) => `regression: ${r}`)].join("\n"),
            dedupeKey: "ci-health-summary",
          });
        }

        ctx.processed(rows?.length ?? 0);
        ctx.summary(`${byWf.size} workflow(s); ${flaky.length} flaky, ${regressions.length} duration regression(s)`);
        ctx.meta({ flaky, regressions });
        return { workflows: byWf.size, flaky: flaky.length, regressions: regressions.length };
      });
      return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
    }

    return json({ error: "Unknown mode; expected ingest|analyze" }, 400, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-ci-health] error:", message);
    return json({ error: message }, 500, corsHeaders);
  }
});
