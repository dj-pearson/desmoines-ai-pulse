/**
 * SECURITY: verify_jwt = false
 * Reason: cron-invoked control-plane job; authorization is enforced in-function
 *   via requireAdminOrApiKey (EDGE_FUNCTION_API_KEY / admin JWT) per WEB-SEC-001.
 * Risk level: MEDIUM (admin/service-only; no user data returned).
 *
 * agent-escalation-router (AOS-CORE-005)
 *
 * Routes escalated (tier-2/3) agent_tasks to the correct human queue and
 * coalesces duplicates so nothing gets lost or spams the same owner:
 *   1. Pull unrouted escalated tasks (status='escalated', queue IS NULL).
 *   2. Dedupe: if an already-routed OPEN task shares (agent_key, dedupe_key),
 *      coalesce this one into it (close as duplicate) instead of routing again.
 *   3. Otherwise assign queue = agent_registry.owner_role for the task's agent
 *      (fallback 'admin'), stamp routed_at, and notify the owner (best-effort).
 *   4. Audit every decision to security_audit_logs.
 *
 * Fail-open: a per-task routing error leaves that task open+unrouted and raises
 * an ops alert rather than dropping it. The batch continues.
 *
 * Backward-compat: additive only — reads agent_registry, updates agent_tasks
 * columns added additively in AOS-CORE-004/005. No shape change to any endpoint
 * a shipped mobile binary calls.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob, sendJobAlert } from "../_shared/jobRunner.ts";
import { writeAuditLog } from "../_shared/auditLog.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

const BATCH = 100; // tasks routed per invocation

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

interface AgentTask {
  id: string;
  agent_key: string;
  category: string;
  tier: number;
  title: string;
  dedupe_key: string | null;
  status: string;
  queue: string | null;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const result = await runJob("agent-escalation-router", async (ctx) => {
    // Owner-role lookup per agent, cached for the batch.
    const ownerCache = new Map<string, string>();
    async function ownerRoleFor(agentKey: string): Promise<string> {
      if (ownerCache.has(agentKey)) return ownerCache.get(agentKey)!;
      const { data } = await supabase
        .from("agent_registry")
        .select("owner_role")
        .eq("agent_key", agentKey)
        .maybeSingle();
      const role = data?.owner_role ?? "admin";
      ownerCache.set(agentKey, role);
      return role;
    }

    const { data: tasks, error } = await supabase
      .from("agent_tasks")
      .select("id, agent_key, category, tier, title, dedupe_key, status, queue")
      .eq("status", "escalated")
      .is("queue", null)
      .order("created_at", { ascending: true })
      .limit(BATCH);

    if (error) throw error;

    let routed = 0;
    let coalesced = 0;
    let failed = 0;

    for (const task of (tasks ?? []) as AgentTask[]) {
      try {
        // ── Dedupe: coalesce into an existing routed OPEN task with same key ──
        if (task.dedupe_key) {
          const { data: existing } = await supabase
            .from("agent_tasks")
            .select("id")
            .eq("agent_key", task.agent_key)
            .eq("dedupe_key", task.dedupe_key)
            .not("queue", "is", null)
            .in("status", ["escalated", "assigned"])
            .neq("id", task.id)
            .order("routed_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (existing?.id) {
            await supabase
              .from("agent_tasks")
              .update({
                status: "closed",
                resolution: { coalesced_into: existing.id, reason: "duplicate escalation" },
              })
              .eq("id", task.id);

            await writeAuditLog(supabase, {
              eventType: "agent_task_routing",
              actorId: null,
              action: "coalesce",
              resource: "agent_tasks",
              severity: "low",
              details: { taskId: task.id, coalescedInto: existing.id, agentKey: task.agent_key, dedupeKey: task.dedupe_key },
            });
            coalesced++;
            ctx.processed(1);
            continue;
          }
        }

        // ── Route to the owner queue ────────────────────────────────────────
        const queue = await ownerRoleFor(task.agent_key);
        const { error: updateError } = await supabase
          .from("agent_tasks")
          .update({ queue, routed_at: new Date().toISOString() })
          .eq("id", task.id);
        if (updateError) throw updateError;

        await writeAuditLog(supabase, {
          eventType: "agent_task_routing",
          actorId: null,
          action: "route",
          resource: "agent_tasks",
          severity: "low",
          details: { taskId: task.id, queue, tier: task.tier, agentKey: task.agent_key, category: task.category },
        });

        // Notify the owner queue via notifyOps (AOS-CORE-010): immediate for
        // tier-2/3, severity-routed, coalesced per queue so a burst of tasks in
        // the same queue doesn't storm inboxes. Never blocks routing.
        await notifyOps(supabase, {
          severity: task.tier >= 3 ? "high" : "medium",
          title: `New tier-${task.tier} task for ${queue}`,
          body: `"${task.title}" from ${task.agent_key} (${task.category}) was routed to ${queue}.`,
          dedupeKey: `escalation:${queue}`,
        }).catch((e) =>
          console.warn(`[escalation-router] notify failed for ${task.id}:`, e?.message ?? e),
        );

        routed++;
        ctx.processed(1);
      } catch (err) {
        // Fail open: leave the task open+unrouted and alert ops.
        failed++;
        ctx.failed(1);
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[escalation-router] failed to route task ${task.id}:`, msg);
        await sendJobAlert(
          "agent-escalation-router",
          `Failed to route agent_task ${task.id} (${task.agent_key}): ${msg}. Task left open+unrouted.`,
        ).catch(() => {});
      }
    }

    ctx.meta({ routed, coalesced, failed });
    return { routed, coalesced, failed, considered: tasks?.length ?? 0 };
  });

  return json(
    { ok: result.ok, ...(result.result ?? {}), status: result.status },
    result.ok ? 200 : 500,
    corsHeaders,
  );
});

