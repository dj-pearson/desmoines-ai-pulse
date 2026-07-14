/**
 * SECURITY: verify_jwt = false
 * Reason: admin console action; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (admin corrects a ticket's classification; captures feedback).
 *
 * support-ticket-reclassify (AOS-CS-005) — human correction of a ticket's
 * classification. Records the correction as feedback (the agent's prior values
 * are captured for model improvement) and updates the ticket with
 * classification_source = 'human'. Also lists tickets for the console.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../../cors.ts";
import { requireAdminOrApiKey } from "../../apiKeyAuth.ts";

const SLA_HOURS: Record<string, number> = { urgent: 2, high: 8, normal: 24, low: 72 };

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
  const action = String(body.action ?? "list");

  if (action === "list") {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, subject, body, channel, status, priority, sentiment, urgency, category, sla_due_at, classification_source, classification_confidence, classified_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return json({ error: error.message }, 500, corsHeaders);
    return json({ ok: true, tickets: data ?? [] }, 200, corsHeaders);
  }

  if (action === "reclassify") {
    const id = body.id ? String(body.id) : null;
    if (!id) return json({ error: "id required" }, 400, corsHeaders);

    const { data: prior } = await supabase
      .from("support_tickets")
      .select("sentiment, urgency, priority, category")
      .eq("id", id)
      .maybeSingle();

    const sentiment = body.sentiment ? String(body.sentiment) : prior?.sentiment ?? null;
    const urgency = body.urgency ? String(body.urgency) : prior?.urgency ?? null;
    const priority = body.priority ? String(body.priority) : prior?.priority ?? "normal";
    const category = body.category ? String(body.category) : prior?.category ?? null;
    const nowIso = new Date().toISOString();
    // Recompute SLA from the corrected priority.
    const slaHours = SLA_HOURS[priority] ?? 24;
    const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

    const { error: upErr } = await supabase
      .from("support_tickets")
      .update({ sentiment, urgency, priority, category, sla_due_at: slaDueAt, classification_source: "human", classified_at: nowIso, updated_at: nowIso })
      .eq("id", id);
    if (upErr) return json({ error: upErr.message }, 500, corsHeaders);

    await supabase.from("support_ticket_feedback").insert({
      ticket_id: id,
      corrected_sentiment: sentiment,
      corrected_urgency: urgency,
      corrected_priority: priority,
      corrected_category: category,
      prior: prior ?? null,
      actor: body.actorId ? String(body.actorId) : null,
    });

    return json({ ok: true, id }, 200, corsHeaders);
  }

  return json({ error: `unknown action: ${action}` }, 400, corsHeaders);
});
