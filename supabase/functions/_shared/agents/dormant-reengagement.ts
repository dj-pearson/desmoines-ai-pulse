/**
 * agent dormant-reengagement (AOS-NURTURE-005) — dormant-user re-engagement.
 *
 * On a conservative cadence, nudges dormant users back with what they missed +
 * a personalized highlight. Guardrails, in order:
 *   1. consent (messagingAllowed) + not already suppressed (aged out),
 *   2. cross-agent coordination — skip if ANY nurture agent messaged this user
 *      in COORD_WINDOW_DAYS (via the shared nurture_sends ledger),
 *   3. re-engagement frequency cap (REENGAGE_GAP_DAYS),
 *   4. age-out — after MAX_ATTEMPTS ignored re-engagement sends, suppress.
 * Reactivations are measured against a prior pass; content is quality-gated.
 *
 * Consolidated into `agent-runner` (was `agent-reengagement/index.ts`).
 */
import { scoreOutput } from "../scoreOutput.ts";
import { sendNurtureEmail } from "../sendNurtureEmail.ts";
import { recentlyMessaged, shouldAgeOut } from "../nurtureCoordination.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "dormant-reengagement";
const KIND = "reengagement";
const BATCH = 200;
const COORD_WINDOW_DAYS = 7;   // no overlap with any other nurture in this window
const REENGAGE_GAP_DAYS = 21;  // conservative cadence between re-engagement sends
const MAX_ATTEMPTS = 3;        // age out after this many ignored sends
const DAY = 24 * 60 * 60 * 1000;
const SITE = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "https://desmoinesinsider.com").replace(/\/+$/, "");

export const run: AgentRun = async (ctx, { supabase }) => {
  const now = Date.now();

  // Measure reactivations from prior re-engagement sends (7–60d old, no outcome
  // yet) whose user is now active/reactivated.
  let reactivations = 0;
  const { data: prior } = await supabase
    .from("nurture_sends")
    .select("id, user_id, created_at")
    .eq("agent_key", AGENT_KEY)
    .is("activated_at", null)
    .gte("created_at", new Date(now - 60 * DAY).toISOString())
    .lte("created_at", new Date(now - 3 * DAY).toISOString())
    .limit(500);
  for (const s of (prior ?? []) as { id: string; user_id: string }[]) {
    const { data: prof } = await supabase.from("profiles").select("lifecycle_stage").eq("user_id", s.user_id).maybeSingle();
    if (prof?.lifecycle_stage === "active" || prof?.lifecycle_stage === "reactivated") {
      const { data: upd } = await supabase.from("nurture_sends").update({ activated_at: new Date().toISOString() }).eq("id", s.id).is("activated_at", null).select("id");
      if (upd && upd.length) reactivations++;
    }
  }

  // Upcoming highlights (fetched once) for "what you missed / what's next".
  const { data: evs } = await supabase
    .from("events").select("id, title, date, city").gte("date", new Date(now).toISOString()).is("archived_at", null).order("date", { ascending: true }).limit(5);
  const highlights = (evs ?? []) as { id: string; title: string | null; date: string; city: string | null }[];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, email, lifecycle_signals, reengage_suppressed_at")
    .eq("lifecycle_stage", "dormant")
    .is("reengage_suppressed_at", null)
    .not("email", "is", null)
    .limit(BATCH);
  const rows = (profiles ?? []) as { user_id: string; email: string; lifecycle_signals: { messagingAllowed?: boolean } | null }[];

  let sent = 0, coordSkipped = 0, capped = 0, agedOut = 0, gated = 0, noConsent = 0, capUnknown = 0;

  for (const p of rows) {
    if (p.lifecycle_signals?.messagingAllowed === false) { noConsent++; continue; }

    // Age-out repeatedly-unresponsive users.
    if (await shouldAgeOut(supabase, p.user_id, KIND, MAX_ATTEMPTS)) {
      await supabase.from("profiles").update({ reengage_suppressed_at: new Date().toISOString() }).eq("user_id", p.user_id);
      agedOut++;
      continue;
    }

    // Cross-agent coordination — no overlap with any nurture in the window.
    if (await recentlyMessaged(supabase, p.user_id, COORD_WINDOW_DAYS)) { coordSkipped++; continue; }

    // Re-engagement cadence.
    // WEB-BE-032: the error is captured and the cadence check fails CLOSED. A
    // discarded error left `last` null, so the gap never applied and a dormant
    // user got a second re-engagement email inside the window.
    const { data: last, error: lastError } = await supabase.from("nurture_sends").select("created_at").eq("user_id", p.user_id).eq("kind", KIND).order("created_at", { ascending: false }).limit(1);
    if (lastError) { capUnknown++; continue; }
    if (last?.[0] && now - new Date(last[0].created_at).getTime() < REENGAGE_GAP_DAYS * DAY) { capped++; continue; }

    const list = highlights.length
      ? `<ul>${highlights.map((e) => `<li><a href="${SITE}/events/${e.id}">${(e.title ?? "Event").replace(/</g, "&lt;")}</a>${e.city ? ` — ${e.city.replace(/</g, "&lt;")}` : ""}</li>`).join("")}</ul>`
      : `<p><a href="${SITE}/events">See what's happening →</a></p>`;
    const html = `<h1>We've missed you!</h1><p>A lot has happened in Des Moines lately — here are a few things coming up you might like:</p>${list}<p><a href="${SITE}/events">Explore everything →</a></p>`;
    const text = `We've missed you! Coming up: ${highlights.map((e) => e.title).join(", ") || `${SITE}/events`}`;

    const gate = await scoreOutput(supabase, { agentKey: AGENT_KEY, category: "nurture", content: text });
    if (!gate.passed) { gated++; continue; }

    const res = await sendNurtureEmail(supabase, { agentKey: AGENT_KEY, kind: KIND, userId: p.user_id, email: p.email, subject: "Here's what you've missed in Des Moines", bodyHtml: html, bodyText: text, qualityScore: gate.score });
    if (res.ok) sent++; else capped++;
  }

  ctx.processed(rows.length);
  ctx.summary(`re-engagement: ${sent} sent, ${coordSkipped} coord-skipped, ${capped} capped, ${capUnknown} cap-unreadable, ${agedOut} aged-out, ${gated} gated; ${reactivations} reactivation(s)`);
  ctx.meta({ sent, coordSkipped, capped, capUnknown, agedOut, gated, noConsent, reactivations });
  return { sent, coordSkipped, capped, capUnknown, agedOut, reactivations };
};
