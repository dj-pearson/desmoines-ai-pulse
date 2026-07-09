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
  "data-quality-heal": { fn: "data-quality-heal", body: {} },
  "dedupe-content": { fn: "dedupe-content", body: {} },
  "moderate-content": { fn: "moderate-content", body: { mode: "sweep" } },
  "validate-source-urls": { fn: "validate-source-urls", body: {} },
  "ai-article-pipeline": { fn: "ai-article-pipeline", body: {} },
  "weekly-digest": { fn: "assemble-weekly-digest", body: {} },
  "social-media-manager": { fn: "social-daily-poster", body: {} },
  "sitemap-refresh": { fn: "regenerate-sitemaps", body: {} },
  "job-health-watchdog": { fn: "job-health-watchdog", body: {} },
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
