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
import { notifyOps } from "../_shared/notifyOps.ts";

const AGENT_KEY = "crm-console";

// Rule-based "agent-suggested" next action per stage (humans accept or override).
const STAGE_SUGGESTION: Record<string, string> = {
  new: "Qualify the account, then send the intro outreach.",
  qualified: "Generate a proposal and reach out.",
  contacted: "Follow up on the outreach; log the response.",
  proposal: "Schedule a call to walk through the proposal.",
  won: "Kick off advertiser onboarding.",
  lost: "Log the loss reason for future targeting.",
};

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
        supabase.from("crm_opportunities").select("id, name, stage, value, next_action, next_action_at, account_id, campaign_id, assigned_closer, onboarding_started, closed_at, updated_at").order("updated_at", { ascending: false }).limit(300),
        supabase.from("crm_accounts").select("id, name, category, city, website, advertiser_user_id").order("created_at", { ascending: false }).limit(300),
        supabase.from("proposals").select("id, opportunity_id, status, created_at").order("created_at", { ascending: false }).limit(300),
      ]);
      // Attach the agent-suggested next action per opportunity.
      const opportunities = ((opps.data ?? []) as Record<string, unknown>[]).map((o) => ({ ...o, suggested_next_action: STAGE_SUGGESTION[String(o.stage)] ?? null }));
      return j({ ok: true, leads: leads.data ?? [], opportunities, accounts: accounts.data ?? [], proposals: proposals.data ?? [] }, 200, corsHeaders);
    }

    if (action === "activities") {
      const { data } = await supabase.from("crm_activities").select("id, type, note, actor, created_at").eq("opportunity_id", String(body.id)).order("created_at", { ascending: false }).limit(100);
      return j({ ok: true, activities: data ?? [] }, 200, corsHeaders);
    }

    if (action === "log_activity") {
      const oppId = String(body.id ?? "");
      const note = String(body.note ?? "").trim();
      const type = String(body.type ?? "note");
      if (!oppId || !note) return j({ error: "id and note required" }, 400, corsHeaders);
      await supabase.from("crm_activities").insert({ opportunity_id: oppId, type, note, actor: actor === "admin" ? null : actor });
      await audit("crm_activity_logged", `crm_opportunities:${oppId}`, { type });
      return j({ ok: true }, 200, corsHeaders);
    }

    if (action === "accept_suggestion") {
      const oppId = String(body.id ?? "");
      const { data: opp } = await supabase.from("crm_opportunities").select("stage").eq("id", oppId).maybeSingle();
      const suggestion = STAGE_SUGGESTION[String(opp?.stage)] ?? null;
      if (!suggestion) return j({ error: "no suggestion for stage" }, 400, corsHeaders);
      await supabase.from("crm_opportunities").update({ next_action: suggestion }).eq("id", oppId);
      await supabase.from("crm_activities").insert({ opportunity_id: oppId, type: "suggestion_accepted", note: suggestion, actor: actor === "admin" ? null : actor });
      await audit("crm_suggestion_accepted", `crm_opportunities:${oppId}`, { suggestion });
      return j({ ok: true }, 200, corsHeaders);
    }

    if (action === "assign_closer") {
      const oppId = String(body.id ?? "");
      const closer = body.closer ? String(body.closer) : null;
      await supabase.from("crm_opportunities").update({ assigned_closer: closer }).eq("id", oppId);
      await audit("crm_assign_closer", `crm_opportunities:${oppId}`, { closer });
      return j({ ok: true }, 200, corsHeaders);
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
      await supabase.from("crm_activities").insert({ opportunity_id: id, type: "stage_change", note: `→ ${stage}`, actor: actor === "admin" ? null : actor });
      await audit("crm_stage_change", `crm_opportunities:${id}`, patch);
      // A won opportunity triggers advertiser onboarding (AOS-PROSPECT-007).
      if (stage === "won") {
        await supabase.from("crm_opportunities").update({ onboarding_started: true, next_action: STAGE_SUGGESTION.won }).eq("id", id);
        const { data: opp } = await supabase.from("crm_opportunities").select("name, account_id").eq("id", id).maybeSingle();
        await notifyOps(supabase, { severity: "medium", title: "Deal won — start advertiser onboarding", body: `Opportunity ${opp?.name ?? id} won. Begin onboarding (AOS-PROSPECT-007).`, dedupeKey: `onboarding:${id}` });
        await audit("advertiser_onboarding_triggered", `crm_opportunities:${id}`, { accountId: opp?.account_id });
      }
      return j({ ok: true }, 200, corsHeaders);
    }

    return j({ error: `unknown action: ${action}` }, 400, corsHeaders);
  } catch (err) {
    return j({ error: (err as Error)?.message ?? "crm error" }, 500, corsHeaders);
  }
});
