/**
 * agent weekly-digest (AOS-NURTURE-004) — personalized weekly digest.
 *
 * Weekly, assembles a per-user digest from existing content — interest-matched
 * upcoming events, new restaurants/attractions, and saved-search matches. Shared
 * content is fetched ONCE and filtered per user in memory (efficient). Premium
 * picks are gated by tier; the digest is frequency-capped (7d) and skipped
 * entirely when there's nothing relevant (no filler). Content passes the
 * AOS-GOV-004 quality gate before send; outcomes flow to nurture_sends.
 *
 * Consolidated into `agent-runner` (was `agent-weekly-digest/index.ts`).
 */
import { scoreOutput } from "../scoreOutput.ts";
import { sendNurtureEmail } from "../sendNurtureEmail.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "weekly-digest-personal";
const BATCH = 300;
const GAP_DAYS = 6; // ~weekly frequency cap
const DAY = 24 * 60 * 60 * 1000;
const SITE = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "https://desmoinesinsider.com").replace(/\/+$/, "");

interface EventItem { id: string; title: string | null; category: string | null; date: string; city: string | null; image_url: string | null; }
interface PlaceItem { id: string; name: string | null; is_sponsored: boolean | null; }

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

export const run: AgentRun = async (ctx, { supabase }) => {
  const now = Date.now();
  const todayIso = new Date(now).toISOString();
  const in14 = new Date(now + 14 * DAY).toISOString();
  const since14 = new Date(now - 14 * DAY).toISOString();

  // Shared content, fetched once.
  const [{ data: evs }, { data: rests }, { data: attrs }] = await Promise.all([
    supabase.from("events").select("id, title, category, date, city, image_url").gte("date", todayIso).lte("date", in14).is("archived_at", null).order("date", { ascending: true }).limit(60),
    supabase.from("restaurants").select("id, name, is_sponsored").gte("created_at", since14).order("created_at", { ascending: false }).limit(20),
    supabase.from("attractions").select("id, name, is_sponsored").gte("created_at", since14).order("created_at", { ascending: false }).limit(20),
  ]);
  const events = (evs ?? []) as EventItem[];
  const restaurants = (rests ?? []) as PlaceItem[];
  const attractions = (attrs ?? []) as PlaceItem[];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, email, interests, lifecycle_signals")
    .in("lifecycle_stage", ["active", "onboarding", "reactivated", "at_risk"])
    .not("email", "is", null)
    .limit(BATCH);
  const rows = (profiles ?? []) as { user_id: string; email: string; interests: unknown; lifecycle_signals: { messagingAllowed?: boolean } | null }[];

  let sent = 0, skippedEmpty = 0, skippedCap = 0, gated = 0, skippedConsent = 0;

  for (const p of rows) {
    if (p.lifecycle_signals?.messagingAllowed === false) { skippedConsent++; continue; }

    // Frequency cap.
    const { data: recent } = await supabase
      .from("nurture_sends").select("created_at").eq("user_id", p.user_id).eq("kind", "weekly_digest").order("created_at", { ascending: false }).limit(1);
    if (recent?.[0] && now - new Date(recent[0].created_at).getTime() < GAP_DAYS * DAY) { skippedCap++; continue; }

    // Tier (premium picks gated).
    const { data: sub } = await supabase.from("user_subscriptions").select("plan:subscription_plans(tier)").eq("user_id", p.user_id).in("status", ["active", "trialing"]).maybeSingle();
    const planObj = Array.isArray(sub?.plan) ? sub?.plan[0] : sub?.plan;
    const tier = (planObj?.tier as string | undefined) ?? "free";
    const isPremium = tier === "insider" || tier === "vip";

    // Interest-matched events (fallback to soonest).
    const interests = (Array.isArray(p.interests) ? p.interests : []).map((x) => String(x).toLowerCase());
    const matched = interests.length
      ? events.filter((e) => e.category && interests.some((i) => e.category!.toLowerCase().includes(i)))
      : [];
    const pickedEvents = (matched.length ? matched : events).slice(0, 5);

    // New places — free users get non-sponsored; premium users also see sponsored picks.
    const pickedRest = (isPremium ? restaurants : restaurants.filter((r) => !r.is_sponsored)).slice(0, 3);
    const pickedAttr = (isPremium ? attractions : attractions.filter((a) => !a.is_sponsored)).slice(0, 2);

    // Saved-search matches (light): count upcoming events matching a saved search's category filter.
    const { data: searches } = await supabase.from("saved_searches").select("name, filters").eq("user_id", p.user_id).eq("alerts_enabled", true).limit(5);
    const savedMatches: { name: string; count: number }[] = [];
    for (const s of (searches ?? []) as { name: string; filters: { category?: string } | null }[]) {
      const cat = s.filters?.category?.toLowerCase();
      const count = cat ? events.filter((e) => e.category?.toLowerCase().includes(cat)).length : 0;
      if (count > 0) savedMatches.push({ name: s.name, count });
    }

    const totalItems = pickedEvents.length + pickedRest.length + pickedAttr.length + savedMatches.length;
    if (totalItems === 0) { skippedEmpty++; continue; } // no filler

    // Build content.
    const parts: string[] = ["<h1>Your week in Des Moines</h1>"];
    const textParts: string[] = ["Your week in Des Moines"];
    if (pickedEvents.length) {
      parts.push(`<h2>Upcoming events</h2><ul>${pickedEvents.map((e) => `<li><a href="${SITE}/events/${e.id}">${esc(e.title ?? "Event")}</a>${e.city ? ` — ${esc(e.city)}` : ""} (${new Date(e.date).toLocaleDateString()})</li>`).join("")}</ul>`);
      textParts.push("Events: " + pickedEvents.map((e) => e.title).join(", "));
    }
    if (pickedRest.length) {
      parts.push(`<h2>New restaurants</h2><ul>${pickedRest.map((r) => `<li><a href="${SITE}/restaurants/${r.id}">${esc(r.name ?? "Restaurant")}</a></li>`).join("")}</ul>`);
      textParts.push("New restaurants: " + pickedRest.map((r) => r.name).join(", "));
    }
    if (pickedAttr.length) {
      parts.push(`<h2>New attractions</h2><ul>${pickedAttr.map((a) => `<li><a href="${SITE}/attractions/${a.id}">${esc(a.name ?? "Attraction")}</a></li>`).join("")}</ul>`);
    }
    if (savedMatches.length) {
      parts.push(`<h2>Matches for your saved searches</h2><ul>${savedMatches.map((m) => `<li>${m.count} new for “${esc(m.name)}”</li>`).join("")}</ul>`);
    }
    const html = parts.join("");
    const text = textParts.join("\n");

    // Quality gate.
    const gate = await scoreOutput(supabase, { agentKey: AGENT_KEY, category: "nurture", content: text });
    if (!gate.passed) { gated++; continue; }

    const res = await sendNurtureEmail(supabase, { agentKey: AGENT_KEY, kind: "weekly_digest", userId: p.user_id, email: p.email, subject: "Your week in Des Moines 🎉", bodyHtml: html, bodyText: text, qualityScore: gate.score });
    if (res.ok) sent++; else skippedEmpty++;
  }

  ctx.processed(rows.length);
  ctx.summary(`weekly digest: ${sent} sent, ${skippedEmpty} skipped-empty, ${skippedCap} frequency-capped, ${gated} quality-gated, ${skippedConsent} no-consent`);
  ctx.meta({ sent, skippedEmpty, skippedCap, gated, skippedConsent });
  return { sent, skippedEmpty, skippedCap, gated };
};
