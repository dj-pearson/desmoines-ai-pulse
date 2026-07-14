/**
 * SECURITY: verify_jwt = false
 * Reason: public CSAT submission (one-click rating link from in-app/email).
 *   Anti-abuse via persistent rate limit; only writes a bounded CSAT record for
 *   an existing ticket. No auth required so email links work.
 * Risk level: LOW (records a 1–5 score; low scores re-escalate the ticket).
 *
 * support-csat-submit (AOS-CS-007) — records a CSAT score for a resolved ticket
 * and, when the score is low (≤ 2), auto-re-escalates the ticket to tier-2 with
 * the original context ("a resolved ticket the user hated is not resolved").
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../../cors.ts";
import { checkRateLimitPersistent, addRateLimitHeaders } from "../../rateLimit.ts";
import { createAgentTask } from "../../agentTasks.ts";
import { writeAgentAudit } from "../../auditLog.ts";

const AGENT_KEY = "csat-agent";
const LOW_CSAT = 2; // ≤ this re-escalates

// deno-lint-ignore no-explicit-any
type Client = any;

function j(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

export default (async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405, corsHeaders);

  const rl = await checkRateLimitPersistent(req, { endpoint: "support-csat-submit", windowMs: 15 * 60 * 1000, max: 20, message: "Too many submissions." });
  if (!rl.success && rl.response) return addRateLimitHeaders(rl.response, rl);

  const supabase: Client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const ticketId = body.ticketId ? String(body.ticketId) : null;
  const score = Math.round(Number(body.score));
  const comment = body.comment ? String(body.comment).slice(0, 1000) : null;
  if (!ticketId || !Number.isFinite(score) || score < 1 || score > 5) {
    return j({ error: "ticketId and score (1-5) are required" }, 400, corsHeaders);
  }

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, user_id, channel, resolved_by, subject, body, csat_score")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return j({ error: "ticket not found" }, 404, corsHeaders);

  // Ownership check (before any write): only the authenticated ticket owner may
  // submit CSAT. The verify_jwt=false setting lets email links reach us, so we
  // verify the caller's JWT here and compare it to the ticket's owner.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const { data: userRes } = token
    ? await supabase.auth.getUser(token)
    : { data: { user: null } };
  const requesterId = userRes?.user?.id ?? null;
  if (!ticket.user_id || requesterId !== ticket.user_id) {
    return j({ error: "Not authorized to rate this ticket" }, 403, corsHeaders);
  }

  if (ticket.csat_score != null) return j({ ok: true, alreadyRated: true }, 200, corsHeaders);

  await supabase.from("support_csat").insert({
    ticket_id: ticketId,
    score,
    comment,
    channel: ticket.channel,
    resolved_by: ticket.resolved_by ?? null,
  });
  await supabase.from("support_tickets").update({ csat_score: score, updated_at: new Date().toISOString() }).eq("id", ticketId);
  await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "csat_recorded", targetRef: `support_tickets:${ticketId}`, after: { score, resolvedBy: ticket.resolved_by } });

  let reEscalated = false;
  if (score <= LOW_CSAT) {
    // A resolved ticket the user hated is not resolved — reopen with context.
    await supabase.from("support_tickets").update({ status: "escalated", resolved_at: null, updated_at: new Date().toISOString() }).eq("id", ticketId);
    const task = await createAgentTask(supabase, {
      agentKey: AGENT_KEY,
      category: "support",
      title: `Low CSAT (${score}★) — re-escalated: ${ticket.subject ?? "(no subject)"}`,
      confidence: 0,
      forceTier: 2,
      dedupeKey: `csat-reescalate:${ticketId}`,
      payload: { ticketId, score, comment, originalSubject: ticket.subject, originalBody: ticket.body },
    });
    reEscalated = task.ok;
    await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "csat_reescalation", targetRef: `support_tickets:${ticketId}`, after: { score } });
  }

  return j({ ok: true, score, reEscalated }, 200, corsHeaders);
});
