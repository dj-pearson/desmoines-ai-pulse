/**
 * agent lead-sourcing (AOS-PROSPECT-001) — advertiser lead discovery.
 *
 * DATA SOURCES (documented): existing platform content only —
 *   - restaurants (not sponsored ⇒ not already advertising)
 *   - attractions (not sponsored)
 *   - event venues (organizers of upcoming events)
 * No external scraping and no gated/PII sources: leads come from data we already
 * own. (External enrichment, if ever added, must go through _shared/fetchGuard's
 * allowlist + byte caps — WEB-SEC-001 — and is intentionally OFF here.)
 *
 * Leads are deduped by a stable key, scored for fit, and each creation is
 * audited; the run is budgeted via runAgent.
 *
 * Consolidated into `agent-runner` (was `agent-lead-sourcing/index.ts`).
 */
import { writeAgentAudit } from "../auditLog.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "lead-sourcing";
const PER_SOURCE = 100;

interface Lead {
  business_name: string;
  category: string;
  city: string | null;
  website: string | null;
  source: string;
  source_ref: string;
  fit_reason: string;
  fit_score: number;
  dedupe_key: string;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export const run: AgentRun = async (ctx, { supabase }) => {
  const candidates: Lead[] = [];

  // ── Restaurants (not already advertising = not sponsored) ─────────────
  const { data: rests } = await supabase
    .from("restaurants")
    .select("id, name, city, website, rating, popularity_score, is_sponsored, is_merged")
    .or("is_sponsored.is.null,is_sponsored.eq.false")
    .limit(PER_SOURCE);
  for (const r of (rests ?? []) as { id: string; name: string | null; city: string | null; website: string | null; rating: number | null; popularity_score: number | null; is_merged: boolean | null }[]) {
    if (!r.name || r.is_merged) continue;
    const rating = Number(r.rating) || 0;
    const pop = Number(r.popularity_score) || 0;
    const fit = Math.max(0, Math.min(1, 0.4 + (rating >= 4 ? 0.3 : rating >= 3 ? 0.15 : 0) + (r.website ? 0.15 : 0) + (pop > 50 ? 0.15 : 0)));
    candidates.push({
      business_name: r.name, category: "restaurant", city: r.city, website: r.website,
      source: "existing_content:restaurants", source_ref: `restaurants:${r.id}`,
      fit_reason: `Popular local restaurant${rating ? ` (rating ${rating})` : ""}${r.website ? " with a website" : ""}, not yet advertising.`,
      fit_score: Math.round(fit * 100) / 100, dedupe_key: `restaurant:${slug(r.name)}:${slug(r.city ?? "")}`,
    });
  }

  // ── Attractions (not sponsored) ───────────────────────────────────────
  const { data: attrs } = await supabase
    .from("attractions")
    .select("id, name, website, rating, is_sponsored, is_active")
    .or("is_sponsored.is.null,is_sponsored.eq.false")
    .limit(PER_SOURCE);
  for (const a of (attrs ?? []) as { id: string; name: string | null; website: string | null; rating: number | null; is_active: boolean | null }[]) {
    if (!a.name || a.is_active === false) continue;
    const rating = Number(a.rating) || 0;
    const fit = Math.max(0, Math.min(1, 0.4 + (rating >= 4 ? 0.25 : 0) + (a.website ? 0.2 : 0)));
    candidates.push({
      business_name: a.name, category: "attraction", city: null, website: a.website,
      source: "existing_content:attractions", source_ref: `attractions:${a.id}`,
      fit_reason: `Local attraction${rating ? ` (rating ${rating})` : ""}, a fit for visibility campaigns.`,
      fit_score: Math.round(fit * 100) / 100, dedupe_key: `attraction:${slug(a.name)}`,
    });
  }

  // ── Event organizers (venues of upcoming events) ──────────────────────
  const { data: evs } = await supabase
    .from("events")
    .select("id, title, venue, city")
    .gte("date", new Date().toISOString())
    .not("venue", "is", null)
    .is("archived_at", null)
    .limit(PER_SOURCE);
  const seenVenues = new Set<string>();
  for (const e of (evs ?? []) as { id: string; title: string | null; venue: string | null; city: string | null }[]) {
    if (!e.venue) continue;
    const key = `event_organizer:${slug(e.venue)}`;
    if (seenVenues.has(key)) continue;
    seenVenues.add(key);
    candidates.push({
      business_name: e.venue, category: "event_organizer", city: e.city, website: null,
      source: "existing_content:events", source_ref: `events:${e.id}`,
      fit_reason: `Hosts upcoming events (e.g. "${e.title ?? "event"}") — a fit for event promotion.`,
      fit_score: 0.55, dedupe_key: key,
    });
  }

  // ── Dedupe against existing leads, then insert new ones ───────────────
  const keys = [...new Set(candidates.map((c) => c.dedupe_key))];
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await supabase.from("prospect_leads").select("dedupe_key").in("dedupe_key", keys.slice(i, i + 200));
    for (const d of (data ?? []) as { dedupe_key: string }[]) existing.add(d.dedupe_key);
  }
  const fresh: Lead[] = [];
  const usedKeys = new Set<string>();
  for (const c of candidates) {
    if (existing.has(c.dedupe_key) || usedKeys.has(c.dedupe_key)) continue;
    usedKeys.add(c.dedupe_key);
    fresh.push(c);
  }

  let created = 0;
  for (let i = 0; i < fresh.length; i += 200) {
    const batch = fresh.slice(i, i + 200);
    const { data } = await supabase.from("prospect_leads").insert(batch).select("id");
    created += (data ?? []).length;
  }
  if (created > 0) {
    await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "leads_discovered", targetRef: "prospect_leads", after: { created, sources: ["restaurants", "attractions", "events"] } });
  }

  ctx.processed(candidates.length);
  ctx.summary(`lead sourcing: ${candidates.length} candidates, ${created} new leads (deduped)`);
  ctx.meta({ candidates: candidates.length, created });
  return { candidates: candidates.length, created };
};
