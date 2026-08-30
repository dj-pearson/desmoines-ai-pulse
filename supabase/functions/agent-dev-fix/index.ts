/**
 * SECURITY: verify_jwt = false
 * Reason: CI-invoked control-plane endpoint; auth via requireAdminOrApiKey per
 *   WEB-SEC-001 (the aos-fix-agent workflow calls it with EDGE_FUNCTION_API_KEY).
 * Risk level: MEDIUM (claims/records dev tasks; no code is executed here).
 *
 * agent-dev-fix (AOS-DEV-002) — claim/record for the autonomous fix agent.
 *
 * The aos-fix-agent CI workflow drives the actual fix (Claude Code on a
 * claude/aos-fix branch, runs validate, opens a DRAFT PR). This endpoint is the
 * task bookkeeping:
 *   { mode: 'claim' }                     -> next tier-1 dev task to attempt
 *   { mode: 'record', taskId, outcome,    -> record the attempt; success resolves
 *     prUrl?, log? }                         the task, repeated failures escalate
 *                                            it to tier-2.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

const AGENT_KEY = "dev-fix-agent";
const MAX_ATTEMPTS = 3;

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
    if (mode === "claim") {
      // Next open tier-1 dev task not already at the attempt cap.
      const { data: candidates, error: candidatesError } = await supabase
        .from("agent_tasks")
        .select("id, title, payload, tier")
        .eq("category", "dev")
        .eq("tier", 1)
        .in("status", ["open", "auto_resolving", "escalated"])
        .order("created_at", { ascending: true })
        .limit(20);
      // WEB-BE-032. THE work list.
      if (candidatesError) throw new Error(`dev-fix: candidate task read failed: ${candidatesError.message}`);
      const task = ((candidates ?? []) as Array<{ id: string; title: string; payload: Record<string, unknown> | null }>)
        .find((t) => Number((t.payload ?? {}).fixAttempts ?? 0) < MAX_ATTEMPTS);
      if (!task) return json({ ok: true, task: null, message: "no eligible tier-1 dev task" }, 200, corsHeaders);

      const attempts = Number((task.payload ?? {}).fixAttempts ?? 0) + 1;
      await supabase
        .from("agent_tasks")
        .update({ status: "assigned", payload: { ...(task.payload ?? {}), fixAttempts: attempts, claimedAt: new Date().toISOString() } })
        .eq("id", task.id);

      await writeAgentAudit(supabase, {
        agentKey: AGENT_KEY,
        actionType: "claim_task",
        targetRef: `agent_tasks:${task.id}`,
        after: { attempt: attempts },
      });
      return json({ ok: true, task: { id: task.id, title: task.title, payload: task.payload, attempt: attempts } }, 200, corsHeaders);
    }

    if (mode === "record") {
      const taskId = body.taskId as string | undefined;
      const outcome = body.outcome as string | undefined; // 'success' | 'failure'
      const prUrl = (body.prUrl as string | undefined) ?? null;
      const log = String(body.log ?? "").slice(0, 2000);
      if (!taskId || !outcome) return json({ error: "taskId and outcome required" }, 400, corsHeaders);

      const ledger = await runAgent(AGENT_KEY, async (ctx) => {
        const { data: task, error: taskError } = await supabase
          .from("agent_tasks")
          .select("id, payload")
          .eq("id", taskId)
          .maybeSingle();
        // Per-item. It already fails closed - a null task returns early - but it
        // reported "task not found" for a database failure, which sends whoever
        // reads that to look for a task that exists.
        if (taskError) {
          console.error(`dev-fix: task read failed for ${taskId}: ${taskError.message}`);
          return { error: "task read failed" };
        }
        if (!task) return { error: "task not found" };
        const payload = (task.payload ?? {}) as Record<string, unknown>;
        const attempts = Number(payload.fixAttempts ?? 0);

        if (outcome === "success") {
          await supabase.from("agent_tasks").update({
            status: "resolved",
            resolution: { reason: "auto_fix_pr", prUrl, by: AGENT_KEY },
          }).eq("id", taskId);
          ctx.processed(1);
          ctx.summary(`fixed via draft PR ${prUrl ?? "?"}`);
          await notifyOps(supabase, { severity: "medium", title: `Auto-fix PR opened`, body: `Draft PR for a tier-1 dev task: ${prUrl}`, dedupeKey: `dev-fix:${taskId}` });
        } else {
          // Failure: keep the task open with the failure logged; escalate after cap.
          const escalate = attempts >= MAX_ATTEMPTS;
          await supabase.from("agent_tasks").update({
            status: escalate ? "escalated" : "open",
            tier: escalate ? 2 : 1,
            payload: { ...payload, lastFailureLog: log, escalatedForRepeatedFailure: escalate },
          }).eq("id", taskId);
          ctx.failed(1);
          if (escalate) ctx.escalated(1);
          ctx.summary(`fix attempt ${attempts} failed${escalate ? "; escalated to tier-2" : ""}`);
          if (escalate) {
            await notifyOps(supabase, { severity: "high", title: `Auto-fix failed ${attempts}x — escalated`, body: `Tier-1 dev task ${taskId} escalated to tier-2 after ${attempts} failed fix attempts.`, dedupeKey: `dev-fix-escalate:${taskId}` });
          }
        }
        await writeAgentAudit(supabase, {
          agentKey: AGENT_KEY,
          actionType: "record_attempt",
          targetRef: `agent_tasks:${taskId}`,
          after: { outcome, attempt: attempts, prUrl },
        });
        ctx.meta({ outcome, attempts, prUrl });
        return { outcome, attempts };
      });

      return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
    }

    return json({ error: "Unknown mode; expected claim|record" }, 400, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-dev-fix] error:", message);
    return json({ error: message }, 500, corsHeaders);
  }
});
