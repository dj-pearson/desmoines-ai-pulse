/**
 * agent dev-fix-agent (AOS-DEV-002) — claim/record for the autonomous fix agent.
 *
 * The aos-fix-agent CI workflow drives the actual fix (Claude Code on a
 * claude/aos-fix branch, runs validate, opens a DRAFT PR). This endpoint is the
 * task bookkeeping:
 *   { mode: 'claim' }                     -> next tier-1 dev task to attempt
 *   { mode: 'record', taskId, outcome,    -> record the attempt; success resolves
 *     prUrl?, log? }                         the task, repeated failures escalate
 *                                            it to tier-2.
 *
 * Consolidated into `agent-runner` (was `agent-dev-fix/index.ts`).
 *
 * DEVIATION FROM THE SINGLE-CALLBACK SHAPE: the original had mode dispatch
 * OUTSIDE `runAgent` — the `claim` branch returned directly WITHOUT a ledger
 * entry, only the `record` branch ran under `runAgent`, and validation
 * failures / unknown modes / errors returned HTTP 400 / 500. Under the
 * consolidated dispatcher the whole `run` body is wrapped in `runAgent`, so:
 * (a) the `claim` mode now records a ledger run, and (b) validation failures
 * ("taskId and outcome required") and unknown modes now return HTTP 200 with an
 * `{ error }` result (was 400) and thrown errors surface as the dispatcher's 500.
 * Logic/return payloads are otherwise preserved verbatim.
 */
import { writeAgentAudit } from "../auditLog.ts";
import { notifyOps } from "../notifyOps.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "dev-fix-agent";
const MAX_ATTEMPTS = 3;

export const run: AgentRun = async (ctx, { supabase, body }) => {
  const mode = body.mode as string | undefined;

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
    if (!task) return { ok: true, task: null, message: "no eligible tier-1 dev task" };

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
    return { ok: true, task: { id: task.id, title: task.title, payload: task.payload, attempt: attempts } };
  }

  if (mode === "record") {
    const taskId = body.taskId as string | undefined;
    const outcome = body.outcome as string | undefined; // 'success' | 'failure'
    const prUrl = (body.prUrl as string | undefined) ?? null;
    const log = String(body.log ?? "").slice(0, 2000);
    if (!taskId || !outcome) return { error: "taskId and outcome required" };

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
  }

  return { error: "Unknown mode; expected claim|record" };
};
