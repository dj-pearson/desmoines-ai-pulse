/**
 * agent lead-enrichment (AOS-PROSPECT-003) — enrich + fit-score CRM leads.
 *
 * For each new crm_lead, pulls size signals from the LINKED content
 * (restaurant/attraction via source_ref) — category, web presence, rating,
 * popularity — scores fit/priority, and writes score + rationale to crm_leads.
 * High-fit leads auto-advance to `qualified` (tier-1); ambiguous ones queue a
 * tier-2 human qualification task; clearly weak ones are disqualified. No
 * external fetch (allowlist-gated enrichment intentionally off, WEB-SEC-001) and
 * no PII stored beyond business-contact basics.
 *
 * Consolidated into `agent-runner` (was `agent-lead-enrichment/index.ts`).
 */
import { createAgentTask } from "../agentTasks.ts";
import { writeAgentAudit } from "../auditLog.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "lead-enrichment";
const BATCH = 200;
const QUALIFY_AT = 0.7;   // auto-qualify (tier-1)
const DISQUALIFY_AT = 0.35;

// deno-lint-ignore no-explicit-any
type Client = any;

interface Enrichment {
  category: string | null;
  webPresence: boolean;
  rating: number | null;
  popularity: number | null;
  city: string | null;
}

function scoreFit(e: Enrichment): { fit: number; rationale: string } {
  let fit = 0.35;
  const reasons: string[] = [];
  if (e.rating != null) {
    if (e.rating >= 4) { fit += 0.25; reasons.push(`strong rating (${e.rating})`); }
    else if (e.rating >= 3) { fit += 0.1; reasons.push(`decent rating (${e.rating})`); }
  }
  if (e.popularity != null && e.popularity > 50) { fit += 0.15; reasons.push(`popular (score ${e.popularity})`); }
  if (e.webPresence) { fit += 0.15; reasons.push("has a website"); }
  else reasons.push("no website on file");
  if (e.category === "restaurant") { fit += 0.1; reasons.push("restaurant (high advertising intent)"); }
  fit = Math.max(0, Math.min(1, Math.round(fit * 100) / 100));
  return { fit, rationale: `${(e.category ?? "business")}: ${reasons.join(", ")}.` };
}

async function sizeSignals(supabase: Client, sourceRef: string | null): Promise<{ rating: number | null; popularity: number | null; website: string | null; city: string | null }> {
  const empty = { rating: null, popularity: null, website: null, city: null };
  if (!sourceRef) return empty;
  const [table, id] = sourceRef.split(":");
  if (!table || !id) return empty;
  if (table === "restaurants") {
    const { data, error } = await supabase.from("restaurants").select("rating, popularity_score, website, city").eq("id", id).maybeSingle();
    // WEB-BE-032. Per-item, so it returns `empty` and the batch continues - but
    // `empty` is not neutral here: nulls are written as the enrichment result and
    // then scored as "we looked and there is nothing", which is a different claim
    // from "we could not look".
    if (error) console.warn(`[lead-enrichment] restaurants lookup failed for ${id}: ${error.message}`);
    return data ? { rating: data.rating, popularity: data.popularity_score, website: data.website, city: data.city } : empty;
  }
  if (table === "attractions") {
    const { data, error } = await supabase.from("attractions").select("rating, website").eq("id", id).maybeSingle();
    if (error) console.warn(`[lead-enrichment] attractions lookup failed for ${id}: ${error.message}`);
    return data ? { rating: data.rating, popularity: null, website: data.website, city: null } : empty;
  }
  return empty;
}

export const run: AgentRun = async (ctx, { supabase }) => {
  const { data: leads, error: leadsError } = await supabase
    .from("crm_leads")
    .select("id, business_name, category, prospect_lead_id, enriched_at")
    .eq("status", "new")
    .is("enriched_at", null)
    .limit(BATCH);
  // THE work list. A dropped error enriched nothing and reported success,
  // indistinguishable from having no new leads. runAgent records the throw.
  if (leadsError) throw new Error(`lead-enrichment: could not read new crm_leads: ${leadsError.message}`);
  const rows = (leads ?? []) as { id: string; business_name: string; category: string | null; prospect_lead_id: string | null }[];

  let enriched = 0, qualified = 0, queued = 0, disqualified = 0;

  for (const l of rows) {
    let sourceRef: string | null = null;
    let website: string | null = null;
    if (l.prospect_lead_id) {
      const { data: pl, error: plError } = await supabase.from("prospect_leads").select("source_ref, website").eq("id", l.prospect_lead_id).maybeSingle();
      if (plError) console.warn(`[lead-enrichment] prospect_leads lookup failed for ${l.prospect_lead_id}: ${plError.message}`);
      sourceRef = pl?.source_ref ?? null;
      website = pl?.website ?? null;
    }
    const sig = await sizeSignals(supabase, sourceRef);
    const enrichment: Enrichment = {
      category: l.category,
      webPresence: !!(website || sig.website),
      rating: sig.rating,
      popularity: sig.popularity,
      city: sig.city,
    };
    const { fit, rationale } = scoreFit(enrichment);
    const priority = fit >= QUALIFY_AT ? "high" : fit >= DISQUALIFY_AT ? "medium" : "low";

    let status = "new";
    if (fit >= QUALIFY_AT) { status = "qualified"; qualified++; }
    else if (fit < DISQUALIFY_AT) { status = "disqualified"; disqualified++; }

    await supabase.from("crm_leads").update({
      enrichment, fit_score: fit, fit_rationale: rationale, priority, status, enriched_at: new Date().toISOString(),
    }).eq("id", l.id);
    enriched++;

    if (fit >= QUALIFY_AT) {
      await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "lead_auto_qualified", targetRef: `crm_leads:${l.id}`, after: { fit, priority } });
    } else if (fit >= DISQUALIFY_AT) {
      // Ambiguous → queue human qualification.
      const task = await createAgentTask(supabase, {
        agentKey: AGENT_KEY,
        category: "prospect",
        title: `Qualify lead: ${l.business_name} (fit ${Math.round(fit * 100)}%)`,
        confidence: fit,
        forceTier: 2,
        dedupeKey: `qualify-lead:${l.id}`,
        payload: { leadId: l.id, fit, rationale, enrichment },
      });
      if (task.ok) { queued++; ctx.escalated(1); }
    }
  }

  ctx.processed(rows.length);
  ctx.summary(`enrichment: ${enriched} enriched — ${qualified} auto-qualified, ${queued} queued for human, ${disqualified} disqualified`);
  ctx.meta({ enriched, qualified, queued, disqualified });
  return { enriched, qualified, queued, disqualified };
};
