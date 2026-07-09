/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (posts a CSAT prompt to resolved tickets; no destructive writes).
 *
 * agent-csat (AOS-CS-007) — post-resolution CSAT prompt sender.
 *
 * Hourly, finds tickets newly resolved without a CSAT prompt, determines whether
 * the resolution was auto (agent) or human, posts a lightweight in-app CSAT
 * prompt to the thread (with one-click rating links for email), and stamps
 * csat_prompt_sent_at + resolved_by. Score capture + low-CSAT re-escalation
 * happen in support-csat-submit.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";

const AGENT_KEY = "csat-agent";
const BATCH = 50;

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
  const siteUrl = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const { data: resolved } = await supabase
      .from("support_tickets")
      .select("id, channel, assigned_to, sla_escalated_at, resolved_by")
      .eq("status", "resolved")
      .is("csat_prompt_sent_at", null)
      .not("resolved_at", "is", null)
      .limit(BATCH);
    const tickets = (resolved ?? []) as { id: string; channel: string; assigned_to: string | null; sla_escalated_at: string | null; resolved_by: string | null }[];

    let sent = 0;
    for (const t of tickets) {
      // Auto if no human ever touched it (unassigned + never SLA-escalated).
      const resolvedBy = t.resolved_by ?? (t.assigned_to == null && t.sla_escalated_at == null ? "auto" : "human");
      const link = siteUrl ? `${siteUrl}/csat?ticket=${t.id}` : `/csat?ticket=${t.id}`;
      const promptBody =
        `How did we do? Rate your support experience 1–5.\n` +
        (siteUrl ? [1, 2, 3, 4, 5].map((n) => `${n}★ ${link}&score=${n}`).join("\n") : `Open ${link} to rate.`);
      await supabase.from("support_messages").insert({
        ticket_id: t.id,
        sender: "system",
        body: promptBody,
        metadata: { csat_prompt: true, resolvedBy },
      });
      await supabase.from("support_tickets").update({ csat_prompt_sent_at: new Date().toISOString(), resolved_by: resolvedBy }).eq("id", t.id);
      sent++;
    }

    ctx.processed(sent);
    ctx.summary(`sent ${sent} CSAT prompt(s)`);
    ctx.meta({ sent });
    return { sent };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
