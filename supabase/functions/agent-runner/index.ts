/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane dispatcher; auth via requireAdminOrApiKey per
 *   WEB-SEC-001 (same gate every consolidated agent used individually).
 * Risk level: matches the union of the agents it hosts — each remains read-
 *   mostly / task-opening; none mutate monitored surfaces without a human tier.
 *
 * agent-runner — consolidated dispatcher for the AOS cron agents.
 *
 * Replaces 34 near-identical `agent-<name>` edge functions. Each agent's logic
 * now lives in `_shared/agents/<agent_key>.ts` as `run(ctx, env)`; this file
 * holds the one copy of the shared boilerplate (CORS, admin/API-key auth,
 * service-role client, `runAgent` ledger wrapper, JSON response) and routes to
 * the requested agent.
 *
 * Routing: the agent key comes from the URL sub-path
 * (`/functions/v1/agent-runner/<agent_key>`) or, as a fallback, the request body
 * (`{ "agent": "<agent_key>" }`). The body is parsed once here and handed to the
 * agent as `env.body` (the stream is consumed, so agents must not re-read it).
 *
 * Per-agent observability is unchanged: `runAgent` keys the automation_job_runs
 * ledger / budgets / pause-gate by the agent_key, exactly as before.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { AGENTS } from "../_shared/agents/registry.ts";
import type { AgentRunEnv } from "../_shared/agents/types.ts";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function resolveAgentKey(req: Request, body: Record<string, unknown>): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("agent-runner");
  if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  if (typeof body.agent === "string") return body.agent;
  if (typeof body.agent_key === "string") return body.agent_key;
  return "";
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  // Read the body once; agents receive the parsed object as env.body.
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const agentKey = resolveAgentKey(req, body);
  const agent = AGENTS[agentKey];
  if (!agent) {
    return json(
      { error: `Unknown agent '${agentKey}'`, available: Object.keys(AGENTS).sort() },
      404,
      corsHeaders,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const env: AgentRunEnv = { supabase, req, body };

  const ledger = await runAgent(agentKey, (ctx) => agent(ctx, env));

  return json(
    { ok: ledger.ok, status: ledger.status, agent: agentKey, ...(ledger.result as Record<string, unknown> ?? {}) },
    ledger.ok ? 200 : 500,
    corsHeaders,
  );
});
