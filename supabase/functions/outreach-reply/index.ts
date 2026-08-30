/**
 * SECURITY: verify_jwt = false
 * Reason: inbound-reply webhook (from the mail provider) + admin use; auth via
 *   requireAdminOrApiKey per WEB-SEC-001. Rate-limited.
 * Risk level: LOW (records a reply, halts the sequence, escalates to a human).
 *
 * outreach-reply (AOS-PROSPECT-004) — reply / opt-out handler.
 *
 * When a prospect replies (a mail-provider inbound webhook POSTs here) or opts
 * out, the sequence for that lead is HALTED (crm_leads.outreach_stopped = true)
 * and a tier-2 task is opened for a HUMAN CLOSER — the agent never negotiates or
 * commits pricing. An unsubscribe/opt-out reply also adds the address to the
 * suppression list.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";

const AGENT_KEY = "outreach-sequencer";
const OPT_OUT_RE = /\b(unsubscribe|remove me|stop|not interested|do not (contact|email))\b/i;

// deno-lint-ignore no-explicit-any
type Client = any;

function j(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabase: Client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const email = body.email ? String(body.email).toLowerCase() : null;
  const message = body.message ? String(body.message).slice(0, 2000) : "";
  let leadId = body.leadId ? String(body.leadId) : null;
  if (!leadId && !email) return j({ error: "leadId or email required" }, 400, corsHeaders);

  // Resolve the lead by email if needed.
  if (!leadId && email) {
    const { data } = await supabase.from("crm_leads").select("id").eq("contact_email", email).limit(1).maybeSingle();
    leadId = data?.id ?? null;
  }
  if (!leadId) return j({ ok: true, note: "no matching lead" }, 200, corsHeaders);

  // Halt the sequence.
  await supabase.from("crm_leads").update({ outreach_stopped: true }).eq("id", leadId);
  // Mark the most recent send as replied.
  const { data: lastSend } = await supabase.from("outreach_sends").select("id").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lastSend) await supabase.from("outreach_sends").update({ status: "replied", replied_at: new Date().toISOString() }).eq("id", lastSend.id);

  const optOut = OPT_OUT_RE.test(message);
  if (optOut && email) {
    await supabase.from("outreach_suppression").insert({ email, reason: "opt-out reply" });
  }

  // Land the escalation in the CRM: log a reply activity on the lead's
  // opportunity (if any), so the pipeline console shows it for the closer.
  const { data: opp } = await supabase.from("crm_opportunities").select("id").eq("lead_id", leadId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (opp) {
    await supabase.from("crm_activities").insert({ opportunity_id: opp.id, lead_id: leadId, type: "reply", note: message.slice(0, 500) || "(reply received)" });
  }

  // Escalate to a human closer (tier-2) — the agent never negotiates.
  if (!optOut) {
    await createAgentTask(supabase, {
      agentKey: AGENT_KEY,
      category: "prospect",
      title: `Outreach reply — human closer needed`,
      confidence: 0,
      forceTier: 2,
      dedupeKey: `outreach-reply:${leadId}`,
      payload: { leadId, message },
    });
  }
  await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: optOut ? "outreach_opt_out" : "outreach_reply_escalated", targetRef: `crm_leads:${leadId}`, after: { optOut } });

  return j({ ok: true, halted: true, optOut }, 200, corsHeaders);
});
