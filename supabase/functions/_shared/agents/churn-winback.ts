/**
 * agent churn-winback (AOS-NURTURE-003) — churn-risk + win-back.
 *
 * Daily:
 *  1. Score churn risk from engagement/subscription signals (reusing the
 *     lifecycle classifier's stored signals), stamp profiles.churn_risk_score,
 *     and move clearly high-risk users to lifecycle_stage at_risk.
 *  2. Run a win-back play per at-risk user (frequency-capped, consent-checked,
 *     quality-gated): a value reminder, or an in-policy discount offer. Offers
 *     above WINBACK_AUTO_MAX_PCT are approval-gated (AOS-CORE-007) — queued, not
 *     sent, until a human approves. Every offer/approval is audited.
 *  3. Measure effectiveness: interventions ≥ 14d old are marked retained or
 *     churned from the user's current state.
 *
 * Consolidated into `agent-runner` (was `agent-churn-winback/index.ts`).
 */
import { scoreOutput } from "../scoreOutput.ts";
import { sendNurtureEmail } from "../sendNurtureEmail.ts";
import { createApproval } from "../agentApprovals.ts";
import { writeAgentAudit } from "../auditLog.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "churn-winback";
const BATCH = 200;
const HIGH_RISK = 0.6;
const OFFER_RISK = 0.75;             // offer (vs value reminder) above this
const WINBACK_AUTO_MAX_PCT = 20;     // offers above this need approval
const WINBACK_OFFER_PCT = 20;        // the standard in-policy offer
const INTERVENTION_GAP_DAYS = 30;    // frequency cap per user
const OUTCOME_AFTER_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;
const SITE = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "https://desmoinesinsider.com").replace(/\/+$/, "");

interface Signals { daysSinceActive?: number | null; subStatus?: string | null; messagingAllowed?: boolean; }

function churnScore(s: Signals): number {
  const active = s.daysSinceActive ?? 60;
  let score = Math.min(1, active / 45);
  if (s.subStatus === "past_due") score += 0.3;
  if (s.subStatus === "canceled" || s.subStatus === "cancelled") score += 0.2;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

export const run: AgentRun = async (ctx, { supabase }) => {
  const now = Date.now();

  // ── 3) Effectiveness pass first (interventions ≥ 14d old, no outcome) ──
  const outcomeCutoff = new Date(now - OUTCOME_AFTER_DAYS * DAY).toISOString();
  const { data: pending } = await supabase
    .from("winback_interventions")
    .select("id, user_id")
    .in("status", ["sent"])
    .lte("created_at", outcomeCutoff)
    .limit(500);
  let retained = 0, churnedOut = 0;
  for (const iv of (pending ?? []) as { id: string; user_id: string }[]) {
    const { data: prof } = await supabase.from("profiles").select("lifecycle_stage").eq("user_id", iv.user_id).maybeSingle();
    const stage = prof?.lifecycle_stage as string | undefined;
    const outcome = stage === "active" || stage === "reactivated" ? "retained" : (stage === "churned" || stage === "dormant" ? "churned" : null);
    if (outcome) {
      await supabase.from("winback_interventions").update({ status: outcome, outcome_at: new Date().toISOString() }).eq("id", iv.id);
      if (outcome === "retained") retained++; else churnedOut++;
    }
  }

  // ── 1) Score churn + move high-risk to at_risk ────────────────────────
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, email, lifecycle_stage, lifecycle_signals")
    .in("lifecycle_stage", ["active", "at_risk", "dormant"])
    .not("email", "is", null)
    .limit(BATCH);
  const rows = (profiles ?? []) as { user_id: string; email: string; lifecycle_stage: string; lifecycle_signals: Signals | null }[];

  let scored = 0, movedAtRisk = 0, valueReminders = 0, offers = 0, approvalsQueued = 0, gated = 0, skipped = 0;

  for (const p of rows) {
    const signals = p.lifecycle_signals ?? {};
    const score = churnScore(signals);
    await supabase.from("profiles").update({ churn_risk_score: score, churn_scored_at: new Date().toISOString() }).eq("user_id", p.user_id);
    scored++;

    if (score >= HIGH_RISK && p.lifecycle_stage === "active") {
      await supabase.from("profiles").update({ lifecycle_stage: "at_risk" }).eq("user_id", p.user_id);
      await supabase.from("user_lifecycle_history").insert({ user_id: p.user_id, from_stage: "active", to_stage: "at_risk", reason: "churn risk", signals: { churnScore: score } });
      movedAtRisk++;
    }

    // Win-back play only for high-risk, consented users, respecting frequency.
    if (score < HIGH_RISK) continue;
    if (signals.messagingAllowed === false) { skipped++; continue; }
    const { data: recent, error: recentError } = await supabase
      .from("winback_interventions")
      .select("created_at")
      .eq("user_id", p.user_id)
      .order("created_at", { ascending: false })
      .limit(1);
    // FAIL CLOSED. An empty result reads as "no recent contact", which sends -
    // so a dropped error bypasses the intervention gap for everyone in the sweep
    // (WEB-BE-032 AC2).
    if (recentError) {
      console.warn(`[churn-winback] intervention gap read failed for ${p.user_id}; suppressing: ${recentError.message}`);
      skipped++; continue;
    }
    if (recent?.[0] && now - new Date(recent[0].created_at).getTime() < INTERVENTION_GAP_DAYS * DAY) { skipped++; continue; }

    const wantsOffer = score >= OFFER_RISK;
    const offerPct = wantsOffer ? WINBACK_OFFER_PCT : null;

    // Above-threshold offers are approval-gated (queued, not sent).
    if (wantsOffer && (offerPct ?? 0) > WINBACK_AUTO_MAX_PCT) {
      const approval = await createApproval(supabase, { agentKey: AGENT_KEY, actionType: "issue_credit", payload: { userId: p.user_id, offerPct, reason: "win-back", churnScore: score } });
      await supabase.from("winback_interventions").insert({ user_id: p.user_id, churn_score: score, play: "offer", offer_pct: offerPct, status: "approval_pending", approval_id: approval.approvalId ?? null });
      approvalsQueued++;
      ctx.escalated(1);
      continue;
    }

    // Build content.
    const play = wantsOffer ? "offer" : "value_reminder";
    const subject = wantsOffer ? "We'd love you back — here's 20% off" : "Your Des Moines guide misses you";
    const html = wantsOffer
      ? `<h1>Come back and save</h1><p>We've missed you! Here's <strong>${WINBACK_OFFER_PCT}% off</strong> to pick up where you left off — new events and spots are added every week.</p><p><a href="${SITE}/events">See what's new →</a></p>`
      : `<h1>New in Des Moines</h1><p>There's a lot happening this week — events, new restaurants, and more picked for you.</p><p><a href="${SITE}/events">Explore now →</a></p>`;
    const text = wantsOffer ? `Come back and save ${WINBACK_OFFER_PCT}%: ${SITE}/events` : `See what's new in Des Moines: ${SITE}/events`;

    // Quality gate before send.
    const gate = await scoreOutput(supabase, { agentKey: AGENT_KEY, category: "nurture", content: `${subject}\n\n${text}` });
    if (!gate.passed) { gated++; continue; }

    const res = await sendNurtureEmail(supabase, { agentKey: AGENT_KEY, kind: `winback_${play}`, userId: p.user_id, email: p.email, subject, bodyHtml: html, bodyText: text, qualityScore: gate.score });
    const { data: ivRow } = await supabase.from("winback_interventions").insert({ user_id: p.user_id, churn_score: score, play, offer_pct: offerPct, status: "sent", send_id: res.sendId ?? null }).select("id").single();
    await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: play === "offer" ? "winback_offer_sent" : "winback_reminder_sent", targetRef: `user:${p.user_id}`, after: { churnScore: score, offerPct, interventionId: ivRow?.id } });
    if (wantsOffer) offers++; else valueReminders++;
  }

  ctx.processed(rows.length);
  ctx.summary(`churn: scored ${scored}, ${movedAtRisk}→at_risk; win-back ${valueReminders} reminders, ${offers} offers, ${approvalsQueued} approval-gated; effectiveness ${retained} retained / ${churnedOut} churned`);
  ctx.meta({ scored, movedAtRisk, valueReminders, offers, approvalsQueued, gated, skipped, retained, churnedOut });
  return { scored, movedAtRisk, valueReminders, offers, approvalsQueued, retained, churnedOut };
};
