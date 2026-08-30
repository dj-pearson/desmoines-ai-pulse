/**
 * SECURITY: verify_jwt = false
 * Reason: CI-invoked control-plane endpoint; auth via requireAdminOrApiKey per
 *   WEB-SEC-001 (the aos-test-gen workflow posts with EDGE_FUNCTION_API_KEY).
 * Risk level: LOW (picks test targets, records outcomes; no code executed here).
 *
 * agent-test-gen (AOS-DEV-004) — test-coverage agent coordination.
 *
 *   { mode: 'target' }  -> the next high-value uncovered area to write a test
 *                          for. Prioritizes areas flagged by AOS-DEV-001 error
 *                          clusters, then a curated critical-path rotation;
 *                          skips areas with an already-open test-gen task.
 *   { mode: 'record', area, outcome, prUrl?, log? }
 *                       -> record the attempt (success surfaces the PR, failure
 *                          logs it).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";

const AGENT_KEY = "test-coverage-agent";

// Curated high-value uncovered critical paths (from the audit).
const CRITICAL_PATHS = [
  { area: "auth-flow", desc: "sign-in / sign-up / reset flows and error routing (AuthContext)" },
  { area: "subscription-entitlement", desc: "PremiumGate + useSubscription tier gating and entitlement resolution" },
  { area: "edge-contract-decode", desc: "edge-function response-shape decode contracts (discover-chat, version-check)" },
  { area: "trip-planner", desc: "useTripPlanner itinerary generation happy-path + error states" },
  { area: "favorites-ratings", desc: "favorites/ratings optimistic updates + rollback" },
];

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

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
    if (mode === "target") {
      // Areas that already have an open test-gen task — skip them.
      const { data: openTests, error: openTestsError } = await supabase
        .from("agent_tasks")
        .select("dedupe_key")
        .eq("agent_key", AGENT_KEY)
        .in("status", ["open", "escalated", "assigned", "auto_resolving"])
        .like("dedupe_key", "test:%")
        .limit(200);
      // DEDUPE GUARD, fails CLOSED. `taken` is the only thing stopping a second
      // test-gen task for an area that already has one open; an empty set on a
      // failed read proposes them all again.
      if (openTestsError) {
        console.error(`test-coverage: open-task read failed; proposing nothing this run: ${openTestsError.message}`);
        return { proposed: 0, blocked: "open_task_read_failed" };
      }
      const taken = new Set((openTests ?? []).map((r: { dedupe_key: string }) => r.dedupe_key.slice("test:".length)));

      // Error-cluster components (AOS-DEV-001) are the top priority.
      const { data: errClusters, error: errClustersError } = await supabase
        .from("agent_tasks")
        .select("payload")
        .eq("agent_key", "error-triage")
        .in("status", ["open", "escalated", "assigned"])
        .order("created_at", { ascending: false })
        .limit(20);
      // Supplementary prioritisation signal only - the run still proposes tests
      // without it, just less well targeted. Logged, not fatal.
      if (errClustersError) console.warn(`test-coverage: error-cluster read failed, prioritising without it: ${errClustersError.message}`);
      const errAreas = (errClusters ?? [])
        .map((t: { payload: Record<string, unknown> | null }) => String((t.payload ?? {}).component ?? "").trim())
        .filter((c: string) => c && !taken.has(`err-${c}`))
        .map((c: string) => ({ area: `err-${c}`, desc: `error-cluster hotspot: ${c}` }));

      const rotation = [...errAreas, ...CRITICAL_PATHS.filter((p) => !taken.has(p.area))];
      const target = rotation[0] ?? null;
      return json({ ok: true, target }, 200, corsHeaders);
    }

    if (mode === "record") {
      const area = String(body.area ?? "").slice(0, 80);
      const outcome = body.outcome as string | undefined;
      const prUrl = (body.prUrl as string | undefined) ?? null;
      const log = String(body.log ?? "").slice(0, 2000);
      if (!area || !outcome) return json({ error: "area and outcome required" }, 400, corsHeaders);

      const ledger = await runAgent(AGENT_KEY, async (ctx) => {
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
      });
      return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
    }

    return json({ error: "Unknown mode; expected target|record" }, 400, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-test-gen] error:", message);
    return json({ error: message }, 500, corsHeaders);
  }
});
