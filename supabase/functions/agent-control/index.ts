/**
 * SECURITY: verify_jwt = false
 * Reason: admin control-plane endpoint; authorization enforced in-function via
 *   requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: MEDIUM (toggles agents / triggers runs; admin-gated + audited).
 *
 * agent-control (AOS-CORE-008)
 *
 * Backs the /admin/agents dashboard controls:
 *   { mode: 'toggle', agentKey, enabled, actorId }  set agent_registry.enabled (audited)
 *   { mode: 'run',    agentKey, actorId }            trigger the agent's edge function (audited)
 *
 * "Run now" maps an agent_key to its runnable edge function + default body. An
 * agent without a directly-runnable function returns not_runnable (not an error).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { writeAuditLog } from "../_shared/auditLog.ts";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// agent_key -> { fn: edge function name, body: default invocation body }
const RUN_MAP: Record<string, { fn: string; body: Record<string, unknown> }> = {
  "backfill-images": { fn: "backfill-images", body: { category: "events", batchSize: 10 } },
  "data-quality-heal": { fn: "maintenance/data-quality-heal", body: {} },
  "dedupe-content": { fn: "ingest/dedupe-content", body: {} },
  "moderate-content": { fn: "moderate-content", body: { mode: "sweep" } },
  "validate-source-urls": { fn: "ingest/validate-source-urls", body: {} },
  "ai-article-pipeline": { fn: "ai-article-pipeline", body: {} },
  "weekly-digest": { fn: "notifications/assemble-weekly-digest", body: {} },
  "social-media-manager": { fn: "social-daily-poster", body: {} },
  "sitemap-refresh": { fn: "maintenance/regenerate-sitemaps", body: {} },
  "job-health-watchdog": { fn: "maintenance/job-health-watchdog", body: {} },
  "escalation-router": { fn: "agent-escalation-router", body: {} },
  "approval-sweeper": { fn: "agent-approvals", body: { mode: "sweep" } },
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const body = await req.json().catch(() => ({}));
  const mode = body.mode as string | undefined;
  const agentKey = body.agentKey as string | undefined;
  const actorId = (body.actorId as string | undefined) ?? null;

  try {
    // Global pause (AOS-CORE-009): one-click flip of the aos_kill_switch flag.
    // Takes effect on the next agent invocation — no deploy. No agentKey needed.
    if (mode === "global_pause") {
      const paused = body.paused === true;
      const { error } = await supabase
        .from("feature_flags")
        .update({ enabled: paused })
        .eq("flag_key", "aos_kill_switch");
      if (error) throw error;

      await writeAuditLog(supabase, {
        eventType: "agent_control",
        actorId,
        action: paused ? "global_pause_on" : "global_pause_off",
        resource: "feature_flags",
        severity: "high",
        details: { flag: "aos_kill_switch", paused },
      });
      return json({ ok: true, paused }, 200, corsHeaders);
    }

    if (!agentKey) return json({ error: "agentKey required" }, 400, corsHeaders);

    // Tune per-agent/category thresholds + budget (AOS-CORE-011). Read live by
    // getAgentConfig/createAgentTask, so tuning takes effect without a deploy.
    // The 0.80 safety floor for sensitive categories is enforced by the DB
    // trigger; here we surface a clear error and pass auto_override through.
    if (mode === "update_config") {
      const updates: Record<string, unknown> = {};
      if (typeof body.tier1ConfidenceThreshold === "number") {
        const t = body.tier1ConfidenceThreshold as number;
        if (t < 0 || t > 1) return json({ error: "threshold must be in [0,1]" }, 400, corsHeaders);
        updates.tier1_confidence_threshold = t;
      }
      if (body.monthlyCostBudgetUsd === null || typeof body.monthlyCostBudgetUsd === "number") {
        updates.monthly_cost_budget_usd = body.monthlyCostBudgetUsd;
      }
      if (typeof body.autoOverride === "boolean") updates.auto_override = body.autoOverride;

      // Mode flip shadow->live (AOS-GOV-005). `agentMode` carries the value
      // (`mode` is already the operation selector). Flipping a financial/
      // destructive category to live is gated behind the AOS-CORE-011 safety
      // floor: it needs an explicit auto_override.
      const agentMode = body.agentMode as string | undefined;
      if (agentMode === "shadow" || agentMode === "live") {
        if (agentMode === "live") {
          const { data: reg } = await supabase
            .from("agent_registry")
            .select("category, auto_override")
            .eq("agent_key", agentKey)
            .maybeSingle();
          const sensitive = reg?.category === "security" || reg?.category === "manage";
          const overridden = updates.auto_override === true || reg?.auto_override === true;
          if (sensitive && !overridden) {
            return json({
              ok: false,
              safetyFloor: true,
              error: `Promoting a ${reg?.category} agent to live requires an explicit override (auto_override).`,
            }, 200, corsHeaders);
          }
        }
        updates.mode = agentMode;
      }

      if (Object.keys(updates).length === 0) return json({ error: "nothing to update" }, 400, corsHeaders);

      const { error } = await supabase.from("agent_registry").update(updates).eq("agent_key", agentKey);
      if (error) {
        // The floor trigger raises a clear message — return it as a 200
        // validation result (not a server error) so the UI can show it.
        if (/safety floor/i.test(error.message)) {
          return json({ ok: false, safetyFloor: true, error: error.message }, 200, corsHeaders);
        }
        throw error;
      }

      await writeAuditLog(supabase, {
        eventType: "agent_control",
        actorId,
        action: "update_config",
        resource: "agent_registry",
        severity: "medium",
        details: { agentKey, ...updates },
      });
      return json({ ok: true, agentKey, updates }, 200, corsHeaders);
    }

    if (mode === "toggle") {
      const enabled = body.enabled === true;
      const { error } = await supabase
        .from("agent_registry")
        .update({ enabled })
        .eq("agent_key", agentKey);
      if (error) throw error;

      await writeAuditLog(supabase, {
        eventType: "agent_control",
        actorId,
        action: enabled ? "enable_agent" : "disable_agent",
        resource: "agent_registry",
        severity: "medium",
        details: { agentKey, enabled },
      });
      return json({ ok: true, agentKey, enabled }, 200, corsHeaders);
    }

    if (mode === "run") {
      const target = RUN_MAP[agentKey];
      if (!target) {
        return json({ ok: false, notRunnable: true, message: `No directly-runnable function for "${agentKey}"` }, 200, corsHeaders);
      }

      await writeAuditLog(supabase, {
        eventType: "agent_control",
        actorId,
        action: "run_now",
        resource: "agent_registry",
        severity: "medium",
        details: { agentKey, fn: target.fn },
      });

      // Fire the target function with the service role (fire-and-forget; the
      // triggered agent records its own ledger run).
      const res = await fetch(`${supabaseUrl}/functions/v1/${target.fn}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          "x-trigger-source": "manual",
        },
        body: JSON.stringify(target.body),
      });
      return json({ ok: res.ok, agentKey, fn: target.fn, triggeredStatus: res.status }, res.ok ? 200 : 502, corsHeaders);
    }

    return json({ error: "Unknown mode; expected toggle|run" }, 400, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-control] error:", message);
    return json({ error: message }, 500, corsHeaders);
  }
});
