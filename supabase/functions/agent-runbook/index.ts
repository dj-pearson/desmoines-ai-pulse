/**
 * SECURITY: verify_jwt = false
 * Reason: admin responder endpoint; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: MEDIUM (runs safe steps directly; account-affecting steps queue an
 *   approval — they never execute here).
 *
 * agent-runbook (AOS-SEC-005) — incident-response runbook executor.
 *
 * Modes (POST body):
 *   { mode: 'list', taskId }               -> applicable runbook steps + timeline
 *   { mode: 'run',  taskId, stepId, actorId } -> run a safe step, or queue a
 *                                             human approval for an
 *                                             account/data-affecting one
 *
 * Every executed/queued step is audited and appended to the incident task's
 * `payload.timeline`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";
import { notifyOps } from "../_shared/notifyOps.ts";
import { createApproval } from "../_shared/agentApprovals.ts";
import { runbookFor, stepById, type RunbookStep } from "../_shared/runbooks.ts";

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
  const taskId = body.taskId as string | undefined;
  if (!taskId) return json({ error: "taskId required" }, 400, corsHeaders);

  const { data: task, error } = await supabase
    .from("agent_tasks")
    .select("id, agent_key, title, payload, dedupe_key")
    .eq("id", taskId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500, corsHeaders);
  if (!task) return json({ error: "task not found" }, 404, corsHeaders);

  const { incidentType, steps } = runbookFor(task);

  if (mode === "list") {
    return json({ incidentType, steps, timeline: task.payload?.timeline ?? [] }, 200, corsHeaders);
  }

  if (mode === "run") {
    const stepId = body.stepId as string | undefined;
    const actorId = (body.actorId as string | undefined) ?? null;
    const step = stepId ? stepById(incidentType, stepId) : undefined;
    if (!step) return json({ error: "unknown step for this incident" }, 400, corsHeaders);

    let result: string;
    if (step.requiresApproval) {
      // Account/data-affecting: queue a human approval (AOS-CORE-007), do not run.
      const appr = await createApproval(supabase, {
        agentKey: task.agent_key,
        actionType: step.action,
        payload: { taskId, incidentType, step: step.id, triggeredBy: actorId, evidence: task.payload?.evidence ?? null },
      });
      result = `queued_for_approval:${appr.approvalId ?? "?"}`;
    } else {
      // Safe, reversible: run now.
      result = await runSafeStep(supabase, step, task);
    }

    // Audit + append to the incident timeline.
    await writeAgentAudit(supabase, {
      agentKey: task.agent_key,
      actionType: `runbook_step:${step.id}`,
      targetRef: `agent_tasks:${taskId}`,
      after: { step: step.id, action: step.action, result },
      actor: actorId ? "human" : "agent",
    });

    const timeline = Array.isArray(task.payload?.timeline) ? task.payload.timeline : [];
    timeline.push({ stepId: step.id, label: step.label, actor: actorId, at: new Date().toISOString(), result });
    await supabase
      .from("agent_tasks")
      .update({ payload: { ...(task.payload ?? {}), timeline } })
      .eq("id", taskId);

    return json({ ok: true, step: step.id, result, timeline }, 200, corsHeaders);
  }

  return json({ error: "Unknown mode; expected list|run" }, 400, corsHeaders);
});

/** Execute a safe, reversible step. Extend as concrete integrations land. */
async function runSafeStep(supabase: Client, step: RunbookStep, task: { title: string; agent_key: string }): Promise<string> {
  switch (step.action) {
    case "notify_ops":
      await notifyOps(supabase, {
        severity: "high",
        title: `Incident response: ${task.title}`,
        body: `Runbook step "${step.label}" executed for ${task.agent_key}.`,
        dedupeKey: `runbook:${task.agent_key}:${step.id}`,
      });
      return "notified";
    case "rotate_reminder":
      await notifyOps(supabase, {
        severity: "high",
        title: `Rotation reminder: ${task.title}`,
        body: `Please rotate the exposed secret and confirm on the incident. See the rotation runbook.`,
        dedupeKey: `rotate-reminder:${task.agent_key}`,
      });
      return "rotation reminder sent";
    default:
      return "no-op";
  }
}
