/**
 * agent test-gen (AOS-DEV-004) — test-coverage agent coordination.
 *
 *   { mode: 'target' }  -> the next high-value uncovered area to write a test
 *                          for. Prioritizes areas flagged by AOS-DEV-001 error
 *                          clusters, then a curated critical-path rotation;
 *                          skips areas with an already-open test-gen task.
 *   { mode: 'record', area, outcome, prUrl?, log? }
 *                       -> record the attempt (success surfaces the PR, failure
 *                          logs it).
 *
 * Consolidated into `agent-runner` (was `agent-test-gen/index.ts`).
 *
 * DEVIATION (does not fit the single-runAgent-callback shape): the original was
 * a multi-mode endpoint. Only `mode:'record'` ran inside `runAgent`; the
 * `mode:'target'` path ran OUTSIDE the ledger and each branch returned its own
 * HTTP status (400 for missing params / unknown mode, 500 on thrown errors).
 * The dispatcher always wraps `run` in `runAgent`, so under consolidation:
 *   - `mode:'target'` now records a ledger run (it did not before);
 *   - the missing-params and unknown-mode cases throw, surfacing as the
 *     dispatcher's ledger-failed 500 rather than the original 400.
 * All queries, priorities, dedupe keys, slices, and ctx bookkeeping are verbatim.
 */
import { createAgentTask } from "../agentTasks.ts";
import { writeAgentAudit } from "../auditLog.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "test-coverage-agent";

// Curated high-value uncovered critical paths (from the audit).
const CRITICAL_PATHS = [
  { area: "auth-flow", desc: "sign-in / sign-up / reset flows and error routing (AuthContext)" },
  { area: "subscription-entitlement", desc: "PremiumGate + useSubscription tier gating and entitlement resolution" },
  { area: "edge-contract-decode", desc: "edge-function response-shape decode contracts (discover-chat, version-check)" },
  { area: "trip-planner", desc: "useTripPlanner itinerary generation happy-path + error states" },
  { area: "favorites-ratings", desc: "favorites/ratings optimistic updates + rollback" },
];

export const run: AgentRun = async (ctx, { supabase, body }) => {
  const mode = body.mode as string | undefined;

  if (mode === "target") {
    // Areas that already have an open test-gen task — skip them.
    const { data: openTests } = await supabase
      .from("agent_tasks")
      .select("dedupe_key")
      .eq("agent_key", AGENT_KEY)
      .in("status", ["open", "escalated", "assigned", "auto_resolving"])
      .like("dedupe_key", "test:%")
      .limit(200);
    const taken = new Set((openTests ?? []).map((r: { dedupe_key: string }) => r.dedupe_key.slice("test:".length)));

    // Error-cluster components (AOS-DEV-001) are the top priority.
    const { data: errClusters } = await supabase
      .from("agent_tasks")
      .select("payload")
      .eq("agent_key", "error-triage")
      .in("status", ["open", "escalated", "assigned"])
      .order("created_at", { ascending: false })
      .limit(20);
    const errAreas = (errClusters ?? [])
      .map((t: { payload: Record<string, unknown> | null }) => String((t.payload ?? {}).component ?? "").trim())
      .filter((c: string) => c && !taken.has(`err-${c}`))
      .map((c: string) => ({ area: `err-${c}`, desc: `error-cluster hotspot: ${c}` }));

    const rotation = [...errAreas, ...CRITICAL_PATHS.filter((p) => !taken.has(p.area))];
    const target = rotation[0] ?? null;
    return { ok: true, target };
  }

  if (mode === "record") {
    const area = String(body.area ?? "").slice(0, 80);
    const outcome = body.outcome as string | undefined;
    const prUrl = (body.prUrl as string | undefined) ?? null;
    const log = String(body.log ?? "").slice(0, 2000);
    if (!area || !outcome) throw new Error("area and outcome required");

    if (outcome === "success") {
      // Track the delivered test as a resolved dev task with the PR link.
      await createAgentTask(supabase, {
        agentKey: AGENT_KEY,
        category: "dev",
        title: `Tests generated for ${area}`,
        confidence: 0,
        forceTier: 1,
        dedupeKey: `test:${area}`,
        payload: { area, prUrl, kind: "test_generation" },
      });
      ctx.processed(1);
      ctx.summary(`test PR for ${area}: ${prUrl ?? "?"}`);
    } else {
      ctx.failed(1);
      ctx.summary(`test generation for ${area} failed: ${log.slice(0, 120)}`);
    }
    await writeAgentAudit(supabase, {
      agentKey: AGENT_KEY,
      actionType: "test_gen_attempt",
      targetRef: area,
      after: { outcome, prUrl },
    });
    ctx.meta({ area, outcome, prUrl });
    return { area, outcome };
  }

  throw new Error("Unknown mode; expected target|record");
};
