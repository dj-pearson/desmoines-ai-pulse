/**
 * SECURITY: verify_jwt = false
 * Reason: CI-invoked ingest endpoint; auth via requireAdminOrApiKey per
 *   WEB-SEC-001 (the rls-config-audit workflow posts with EDGE_FUNCTION_API_KEY).
 * Risk level: LOW (opens a review task; no destructive action).
 *
 * agent-config-audit (AOS-SEC-006) — RLS/config drift ingest.
 *
 * The CI drift sweep regenerates the RLS audit + config snapshot, diffs them
 * against the committed baselines, and POSTs the drift here:
 *   { newFindings: string[], configDrift: string[] }
 * New permissive-write/anon-write/missing-RLS/unpinned-definer findings, or
 * CORS/CSP/verify_jwt config drift, open a deduped tier-2 security task. A clean
 * run just records a successful agent run.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

const AGENT_KEY = "config-drift-auditor";

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
  const newFindings: string[] = Array.isArray(body.newFindings) ? body.newFindings.map(String).slice(0, 500) : [];
  const configDrift: string[] = Array.isArray(body.configDrift) ? body.configDrift.map(String).slice(0, 100) : [];

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const drift = [...newFindings, ...configDrift];
    ctx.processed(drift.length);

    if (drift.length === 0) {
      // Clean: close any open drift task.
      const { data: open, error: openError } = await supabase
        .from("agent_tasks")
        .select("id")
        .eq("agent_key", AGENT_KEY)
        .eq("dedupe_key", "config_drift")
        .in("status", ["open", "escalated", "assigned"])
        .limit(5);
      // DEDUPE GUARD. `open config_drift task` is what stops this agent opening a second task for
      // something it has already filed. A dropped error emptied it, so every finding
      // looked new and the queue filled with duplicates of one problem. Logged, not
      // thrown - a duplicate task is noise, and refusing to run at all is worse.
      if (openError) console.error(`open config_drift task read failed; duplicate tasks are possible this run: ${openError.message}`);
      for (const t of (open ?? []) as { id: string }[]) {
        await supabase.from("agent_tasks").update({
          status: "resolved",
          resolution: { reason: "drift_cleared", by: AGENT_KEY },
        }).eq("id", t.id);
      }
      ctx.summary("no RLS/config drift vs baseline");
      return { drift: 0 };
    }

    const task = await createAgentTask(supabase, {
      agentKey: AGENT_KEY,
      category: "security",
      title: `RLS/config drift: ${newFindings.length} RLS finding(s), ${configDrift.length} config change(s)`,
      confidence: 0,
      forceTier: 2,
      dedupeKey: "config_drift",
      payload: {
        newFindings: newFindings.slice(0, 200),
        configDrift,
        note: "Review the drift. If intended, regenerate + commit the baselines (docs/RLS_AUDIT.md, rls-audit-findings.json, security-config-baseline.json) after review.",
      },
    });

    await notifyOps(supabase, {
      severity: "high",
      title: `Security config drift detected (${drift.length})`,
      body: [...newFindings.slice(0, 10), ...configDrift].map((k) => `- ${k}`).join("\n"),
      dedupeKey: "config-drift-alert",
    });

    ctx.escalated(1);
    ctx.summary(`${newFindings.length} new RLS finding(s), ${configDrift.length} config change(s); tier-2 opened`);
    ctx.meta({ newFindings: newFindings.length, configDrift });
    return { drift: drift.length, opened: task.ok ? 1 : 0 };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
