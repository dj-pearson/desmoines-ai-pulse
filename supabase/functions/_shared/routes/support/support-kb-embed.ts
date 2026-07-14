/**
 * SECURITY: verify_jwt = false
 * Reason: cron + admin-invoked; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (embeds KB text via OpenAI; writes embeddings only).
 *
 * support-kb-embed (AOS-CS-003) — (re)embeds support KB articles whose content
 * changed (needs_embedding = true). Runs on a schedule and on-demand after an
 * admin edit. Budgeted/audited via runAgent so embedding cost counts against
 * the support-kb agent budget.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../../cors.ts";
import { requireAdminOrApiKey } from "../../apiKeyAuth.ts";
import { runAgent } from "../../agentRun.ts";
import { embedText, toVectorLiteral } from "../../embed.ts";

const AGENT_KEY = "support-kb";
const BATCH = 20;

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

export default (async (req) => {
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
  const onlyId = body.id ? String(body.id) : null;

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    let query = supabase.from("support_kb").select("id, title, content").eq("needs_embedding", true).limit(BATCH);
    if (onlyId) query = supabase.from("support_kb").select("id, title, content").eq("id", onlyId).limit(1);
    const { data } = await query;
    const rows = (data ?? []) as { id: string; title: string; content: string }[];

    let embedded = 0;
    let cost = 0;
    let tokens = 0;
    const errors: string[] = [];
    for (const r of rows) {
      try {
        const { embedding, costUsd, tokens: t } = await embedText(`${r.title}\n\n${r.content}`);
        const { error } = await supabase
          .from("support_kb")
          .update({ embedding: toVectorLiteral(embedding), needs_embedding: false })
          .eq("id", r.id);
        if (error) throw new Error(error.message);
        embedded++;
        cost += costUsd;
        tokens += t;
      } catch (err) {
        errors.push(`${r.id}: ${(err as Error)?.message ?? "embed error"}`.slice(0, 160));
      }
    }

    ctx.tokens(tokens);
    ctx.cost(cost);
    ctx.processed(rows.length);
    ctx.summary(`embedded ${embedded}/${rows.length} KB article(s), $${cost.toFixed(5)}${errors.length ? `, ${errors.length} error(s)` : ""}`);
    ctx.meta({ embedded, tokens, cost, errors });
    return { embedded, pending: rows.length - embedded, errors };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
