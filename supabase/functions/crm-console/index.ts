/**
 * SECURITY: verify_jwt = false
 * Reason: admin/sales CRM console; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (CRM CRUD; writes audited).
 *
 * crm-console (AOS-PROSPECT-002) — the CRM pipeline backend. Lists/edits leads,
 * accounts, and opportunities; promotes a discovered prospect_lead into a
 * crm_lead + crm_account; advances opportunity stages. All writes are audited.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";

const AGENT_KEY = "crm-console";

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
  const action = String(body.action ?? "board");
  const actor = body.actorId ? String(body.actorId) : "admin";

  const audit = (actionType: string, targetRef: string, after: Record<string, unknown>) =>
    writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType, targetRef, actor, after });

  try {
    if (action === "board") {
      const [leads, opps, accounts, proposals] = await Promise.all([
        supabase.from("crm_leads").select("id, business_name, category, status, fit_score, next_action, next_action_at, account_id, created_at").order("created_at", { ascending: false }).limit(300),
        supabase.from("crm_opportunities").select("id, name, stage, value, next_action, next_action_at, account_id, campaign_id, closed_at, updated_at").order("updated_at", { ascending: false }).limit(300),
        supabase.from("crm_accounts").select("id, name, category, city, website, advertiser_user_id").order("created_at", { ascending: false }).limit(300),
        supabase.from("proposals").select("id, opportunity_id, status, created_at").order("created_at", { ascending: false }).limit(300),
      ]);
      return j({ ok: true, leads: leads.data ?? [], opportunities: opps.data ?? [], accounts: accounts.data ?? [], proposals: proposals.data ?? [] }, 200, corsHeaders);
    }

    if (action === "get_proposal") {
      const { data, error } = await supabase.from("proposals").select("id, html, content, status").eq("id", String(body.id)).maybeSingle();
      if (error) throw new Error(error.message);
      return j({ ok: true, proposal: data }, 200, corsHeaders);
    }

    // Promote a discovered prospect_lead into a crm_account + crm_lead.
    if (action === "promote_prospect") {
      const prospectId = String(body.prospectId ?? "");
      const { data: pl } = await supabase.from("prospect_leads").select("*").eq("id", prospectId).maybeSingle();
      if (!pl) return j({ error: "prospect not found" }, 404, corsHeaders);
      const { data: acct } = await supabase.from("crm_accounts").insert({ name: pl.business_name, category: pl.category, city: pl.city, website: pl.website, business_ref: pl.source_ref, owner: actor === "admin" ? null : actor }).select("id").single();
      const { data: lead } = await supabase.from("crm_leads").insert({ prospect_lead_id: pl.id, account_id: acct?.id, business_name: pl.business_name, category: pl.category, fit_score: pl.fit_score, status: "new" }).select("id").single();
      await supabase.from("prospect_leads").update({ status: "qualified" }).eq("id", pl.id);
      await audit("crm_promote_prospect", `crm_leads:${lead?.id}`, { prospectId, accountId: acct?.id });
      return j({ ok: true, leadId: lead?.id, accountId: acct?.id }, 200, corsHeaders);
    }

    if (action === "upsert_lead") {
      const patch: Record<string, unknown> = {};
      for (const k of ["status", "owner", "next_action", "next_action_at", "account_id"]) if (body[k] !== undefined) patch[k] = body[k];
      const { error } = await supabase.from("crm_leads").update(patch).eq("id", String(body.id));
      if (error) throw new Error(error.message);
      await audit("crm_lead_update", `crm_leads:${body.id}`, patch);
      return j({ ok: true }, 200, corsHeaders);
    }

    if (action === "create_opportunity") {
      const { data, error } = await supabase.from("crm_opportunities").insert({
        account_id: String(body.accountId), lead_id: body.leadId ? String(body.leadId) : null,
        name: String(body.name ?? "Advertising opportunity"), value: Number(body.value) || 0, stage: "new", owner: actor === "admin" ? null : actor,
      }).select("id").single();
      if (error) throw new Error(error.message);
      await audit("crm_opportunity_create", `crm_opportunities:${data?.id}`, { accountId: body.accountId, value: body.value });
      return j({ ok: true, id: data?.id }, 200, corsHeaders);
    }

    if (action === "advance_stage") {
      const id = String(body.id ?? "");
      const stage = String(body.stage ?? "");
      const valid = ["new", "qualified", "contacted", "proposal", "won", "lost"];
      if (!valid.includes(stage)) return j({ error: "invalid stage" }, 400, corsHeaders);
      const patch: Record<string, unknown> = { stage };
      if (stage === "won" || stage === "lost") patch.closed_at = new Date().toISOString();
      if (stage === "won" && body.campaignId) patch.campaign_id = String(body.campaignId);
      const { error } = await supabase.from("crm_opportunities").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      await audit("crm_stage_change", `crm_opportunities:${id}`, patch);
      return j({ ok: true }, 200, corsHeaders);
    }

    return j({ error: `unknown action: ${action}` }, 400, corsHeaders);
  } catch (err) {
    return j({ error: (err as Error)?.message ?? "crm error" }, 500, corsHeaders);
  }
});
