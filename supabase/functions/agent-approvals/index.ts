/**
 * SECURITY: verify_jwt = false
 * Reason: admin/cron control-plane endpoint; authorization enforced in-function
 *   via requireAdminOrApiKey (admin JWT for approve/reject, cron key for sweep)
 *   per WEB-SEC-001.
 * Risk level: HIGH (approving executes guarded actions) — hence admin-gated,
 *   idempotent, and fully audited.
 *
 * agent-approvals (AOS-CORE-007)
 *
 * Modes (POST body):
 *   { mode: 'approve', approvalId }          approve + execute the queued action
 *   { mode: 'reject',  approvalId, reason }  reject with a reason
 *   { mode: 'sweep' }                        expire stale pending approvals and
 *                                            re-escalate them (cron)
 *
 * Approving/rejecting is idempotent: a non-pending approval returns its current
 * state without re-executing. Every decision is audited.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { writeAuditLog } from "../_shared/auditLog.ts";
import { executeApprovedAction } from "../_shared/agentApprovals.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { runJob } from "../_shared/jobRunner.ts";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
type Client = any;

interface Approval {
  id: string;
  agent_key: string;
  category?: string;
  action_type: string;
  proposed_payload: Record<string, unknown> | null;
  status: string;
  expires_at: string | null;
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
    if (mode === "sweep") return await handleSweep(supabase, corsHeaders);
    if (mode === "approve") return await handleDecision(supabase, corsHeaders, body, "approved");
    if (mode === "reject") return await handleDecision(supabase, corsHeaders, body, "rejected");
    return json({ error: "Unknown mode; expected approve|reject|sweep" }, 400, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-approvals] error:", message);
    return json({ error: message }, 500, corsHeaders);
  }
});

async function handleDecision(
  supabase: Client,
  corsHeaders: Record<string, string>,
  body: Record<string, unknown>,
  outcome: "approved" | "rejected",
): Promise<Response> {
  const approvalId = body.approvalId as string | undefined;
  const reason = (body.reason as string | undefined) ?? null;
  const decidedBy = (body.decidedBy as string | undefined) ?? null;
  if (!approvalId) return json({ error: "approvalId required" }, 400, corsHeaders);

  const { data: approval, error } = await supabase
    .from("agent_action_approvals")
    .select("id, agent_key, action_type, proposed_payload, status, expires_at")
    .eq("id", approvalId)
    .maybeSingle();
  if (error) throw error;
  if (!approval) return json({ error: "approval not found" }, 404, corsHeaders);

  // Idempotent: a non-pending approval returns its current state, no re-run.
  if (approval.status !== "pending") {
    return json({ ok: true, idempotent: true, status: approval.status, id: approval.id }, 200, corsHeaders);
  }

  let executionResult: Record<string, unknown> | null = null;
  if (outcome === "approved") {
    executionResult = await executeApprovedAction(
      supabase,
      approval.action_type,
      approval.proposed_payload ?? {},
    );
  }

  const { error: updateError } = await supabase
    .from("agent_action_approvals")
    .update({
      status: outcome,
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
      reason,
      execution_result: executionResult,
    })
    .eq("id", approvalId)
    .eq("status", "pending"); // guard against a concurrent decision (idempotency)
  if (updateError) throw updateError;

  await writeAuditLog(supabase, {
    eventType: "agent_action_approval",
    actorId: decidedBy,
    action: outcome === "approved" ? "approve" : "reject",
    resource: "agent_action_approvals",
    severity: outcome === "approved" ? "high" : "medium",
    details: {
      approvalId,
      agentKey: approval.agent_key,
      actionType: approval.action_type,
      reason,
      executionResult,
    },
  });

  return json({ ok: true, status: outcome, id: approvalId, executionResult }, 200, corsHeaders);
}

async function handleSweep(supabase: Client, corsHeaders: Record<string, string>): Promise<Response> {
  const result = await runJob("approval-sweeper", async (ctx) => {
    const nowIso = new Date().toISOString();
    const { data: stale, error } = await supabase
      .from("agent_action_approvals")
      .select("id, agent_key, action_type, proposed_payload, status, expires_at")
      .eq("status", "pending")
      .not("expires_at", "is", null)
      .lt("expires_at", nowIso)
      .limit(100);
    if (error) throw error;

    let expired = 0;
    let reEscalated = 0;
    for (const appr of (stale ?? []) as Approval[]) {
      // Auto-close as expired (idempotent guard on status='pending').
      const { error: upErr } = await supabase
        .from("agent_action_approvals")
        .update({ status: "expired", decided_at: nowIso, reason: "expired without a decision" })
        .eq("id", appr.id)
        .eq("status", "pending");
      if (upErr) {
        ctx.failed(1);
        continue;
      }
      expired++;
      ctx.processed(1);

      // Re-escalate as a human task so the request isn't silently dropped.
      const owner = await ownerCategory(supabase, appr.agent_key);
      const task = await createAgentTask(supabase, {
        agentKey: appr.agent_key,
        category: owner,
        title: `Expired approval: ${appr.action_type}`,
        confidence: 0, // force human tier
        payload: { approvalId: appr.id, actionType: appr.action_type, proposedPayload: appr.proposed_payload },
        forceTier: 2,
      });
      if (task.ok) reEscalated++;

      await writeAuditLog(supabase, {
        eventType: "agent_action_approval",
        actorId: null,
        action: "expire",
        resource: "agent_action_approvals",
        severity: "medium",
        details: { approvalId: appr.id, agentKey: appr.agent_key, actionType: appr.action_type, reEscalatedTask: task.task?.id ?? null },
      });
    }

    ctx.meta({ expired, reEscalated });
    return { expired, reEscalated, considered: stale?.length ?? 0 };
  });

  return json({ ok: result.ok, ...(result.result ?? {}), status: result.status }, result.ok ? 200 : 500, corsHeaders);
}

/** Resolve the agent's category for the re-escalation task (fallback governance). */
async function ownerCategory(supabase: Client, agentKey: string): Promise<
  "dev" | "maintain" | "nurture" | "prospect" | "support" | "manage" | "security" | "governance"
> {
  const { data } = await supabase
    .from("agent_registry")
    .select("category")
    .eq("agent_key", agentKey)
    .maybeSingle();
  return (data?.category ?? "governance") as
    | "dev" | "maintain" | "nurture" | "prospect" | "support" | "manage" | "security" | "governance";
}
