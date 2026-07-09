/**
 * SECURITY: verify_jwt = false
 * Reason: admin console + agent retrieval; auth via requireAdminOrApiKey.
 * Risk level: LOW (read-only KB retrieval).
 *
 * support-kb-search (AOS-CS-003) — grounded retrieval endpoint. Embeds the
 * query and returns the top KB passages WITH sources (so drafts can cite them).
 * Used by the admin console to test the KB and by the first-responder
 * (AOS-CS-002) via the shared retrieveKb helper. Cost attributed to support-kb.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { retrieveKb } from "../_shared/kbRetrieve.ts";

const AGENT_KEY = "support-kb";

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
  const query = String(body.query ?? "").trim();
  if (!query) return json({ error: "query is required" }, 400, corsHeaders);
  const matchCount = Math.min(Number(body.matchCount) || 5, 20);
  const threshold = typeof body.threshold === "number" ? body.threshold : 0.5;

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const { passages, costUsd, tokens } = await retrieveKb(supabase, query, { matchCount, threshold });
    ctx.tokens(tokens);
    ctx.cost(costUsd);
    ctx.processed(passages.length);
    ctx.summary(`retrieved ${passages.length} passage(s) for "${query.slice(0, 60)}"`);
    return { passages };
  });

  return json({ ok: ledger.ok, ...(ledger.result ?? { passages: [] }) }, ledger.ok ? 200 : 500, corsHeaders);
});
