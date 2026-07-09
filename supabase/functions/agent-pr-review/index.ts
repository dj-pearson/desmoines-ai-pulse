/**
 * SECURITY: verify_jwt = false
 * Reason: CI-invoked; auth via requireAdminOrApiKey per WEB-SEC-001 (the
 *   pr-review workflow posts with EDGE_FUNCTION_API_KEY).
 * Risk level: LOW (records a review summary; no code executed).
 *
 * agent-pr-review (AOS-DEV-006) — records each automated PR review as a
 * budgeted/audited agent run. The deterministic review itself runs in CI
 * (scripts/pr-review.mjs) and posts its summary here.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";

const AGENT_KEY = "pr-review-agent";

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
  const high = Number(body.high) || 0;
  const advisory = Number(body.advisory) || 0;
  const prNumber = body.prNumber ? String(body.prNumber).slice(0, 20) : null;
  const prUrl = body.prUrl ? String(body.prUrl).slice(0, 300) : null;

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    ctx.processed(high + advisory);
    ctx.summary(`PR ${prNumber ?? "?"}: ${high} blocking, ${advisory} advisory`);
    await writeAgentAudit(supabase, {
      agentKey: AGENT_KEY,
      actionType: high > 0 ? "pr_review_block" : "pr_review_pass",
      targetRef: prUrl ?? `pr:${prNumber ?? "?"}`,
      after: { high, advisory, prNumber },
    });
    ctx.meta({ high, advisory, prNumber });
    return { high, advisory, blocked: high > 0 };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
