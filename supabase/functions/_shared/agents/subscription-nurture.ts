/**
 * agent subscription-nurture (AOS-NURTURE-007) — trial / dunning / upgrade.
 *
 * Daily, handles the highest-leverage revenue touchpoints:
 *   - trial_ending  — trialing subs within TRIAL_WINDOW_DAYS of period end.
 *   - dunning       — past_due subs (Stripe smart retries drive the actual
 *                     charge; we send an aligned reminder). A final-step
 *                     courtesy credit would be approval-gated (AOS-CORE-007),
 *                     never auto-applied.
 *   - upgrade_prompt — engaged free users, aligned to the paywall model.
 * Reads only subscription status + tier (no schema tightening). Frequency-
 * capped, consent-respecting, quality-gated. Conversion is measured by stamping
 * activated_at when the subscription converts after a send.
 *
 * Consolidated into `agent-runner` (was `agent-subscription-nurture/index.ts`).
 */
import { scoreOutput } from "../scoreOutput.ts";
import { sendNurtureEmail } from "../sendNurtureEmail.ts";
import { buildTrialNotice, planAmount } from "../trialNotice.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "subscription-nurture";
const TRIAL_WINDOW_DAYS = 3;
const DUNNING_GAP_DAYS = 3;   // aligned to Stripe retry cadence
const UPGRADE_GAP_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const SITE = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "https://desmoinesinsider.com").replace(/\/+$/, "");

// deno-lint-ignore no-explicit-any
type Client = any;

async function consented(supabase: Client, userId: string): Promise<{ email: string; allowed: boolean } | null> {
  const { data, error } = await supabase.from("profiles").select("email, lifecycle_signals").eq("user_id", userId).maybeSingle();
  // Fails closed already - no email means the caller skips the user - but did
  // so silently (WEB-BE-032 AC3).
  if (error) console.warn(`[subscription-nurture] consent read failed for ${userId}: ${error.message}`);
  if (!data?.email) return null;
  return { email: data.email, allowed: (data.lifecycle_signals as { messagingAllowed?: boolean } | null)?.messagingAllowed !== false };
}

async function cappedRecently(supabase: Client, userId: string, kind: string, gapDays: number): Promise<boolean> {
  const { data, error } = await supabase.from("nurture_sends").select("created_at").eq("user_id", userId).eq("kind", kind).order("created_at", { ascending: false }).limit(1);
  // FAIL CLOSED. Returning false means "not messaged recently", which sends -
  // so a dropped error here bypasses the per-kind frequency cap for every user
  // in the sweep. Same defect and same direction as nurtureCoordination
  // (WEB-BE-032 AC2).
  if (error) {
    console.warn(`[subscription-nurture] cap read failed for ${userId}/${kind}; suppressing: ${error.message}`);
    return true;
  }
  return !!(data?.[0] && Date.now() - new Date(data[0].created_at).getTime() < gapDays * DAY);
}

/**
 * Transactional sender for notices the recipient cannot opt out of, because
 * they concern their own billing (WEB-LEGAL-006). Unlike sendStep below it does
 * NOT consult messagingAllowed and does NOT run scoreOutput: both of those fail
 * closed and silently, which for a required disclosure means the people most
 * likely to be surprised by a charge are the ones least likely to be told.
 */
async function sendNotice(supabase: Client, userId: string, email: string, kind: string, subject: string, html: string, text: string): Promise<boolean> {
  const res = await sendNurtureEmail(supabase, {
    agentKey: AGENT_KEY, kind, userId, email, subject,
    bodyHtml: html, bodyText: text, category: "transactional",
  });
  return res.ok;
}

async function sendStep(supabase: Client, userId: string, email: string, kind: string, subject: string, html: string, text: string): Promise<boolean> {
  const gate = await scoreOutput(supabase, { agentKey: AGENT_KEY, category: "nurture", content: text });
  if (!gate.passed) return false;
  const res = await sendNurtureEmail(supabase, { agentKey: AGENT_KEY, kind, userId, email, subject, bodyHtml: html, bodyText: text, qualityScore: gate.score });
  return res.ok;
}

export const run: AgentRun = async (ctx, { supabase }) => {
  const now = Date.now();
  let trial = 0, dunning = 0, upgrade = 0, converted = 0, recovered = 0;

  // ── Conversion / recovery measurement (stamp activated_at) ────────────
  // Measurement only: a failed read understates conversions for one run and
  // sends nothing, so it is logged rather than raised (WEB-BE-032 AC3).
  const { data: openSends, error: openSendsError } = await supabase
    .from("nurture_sends")
    .select("id, user_id, kind, created_at")
    .eq("agent_key", AGENT_KEY)
    .is("activated_at", null)
    .gte("created_at", new Date(now - 45 * DAY).toISOString())
    .lte("created_at", new Date(now - 1 * DAY).toISOString())
    .limit(1000);
  if (openSendsError) console.warn(`[subscription-nurture] conversion sweep read failed: ${openSendsError.message}`);
  for (const s of (openSends ?? []) as { id: string; user_id: string; kind: string }[]) {
    const { data: sub, error: subReadError } = await supabase.from("user_subscriptions").select("status").eq("user_id", s.user_id).in("status", ["active", "trialing"]).maybeSingle();
    if (subReadError) console.warn(`[subscription-nurture] conversion status read failed for ${s.user_id}: ${subReadError.message}`);
    const active = sub?.status === "active";
    if (!active) continue;
    const { data: upd, error: updError } = await supabase.from("nurture_sends").update({ activated_at: new Date().toISOString() }).eq("id", s.id).is("activated_at", null).select("id");
    if (updError) console.warn(`[subscription-nurture] activation stamp failed for send ${s.id}: ${updError.message}`);
    if (upd && upd.length) { if (s.kind === "dunning") recovered++; else converted++; }
  }

  // ── 1) Trial ending ──────────────────────────────────────────────────
  // Safety net only. stripe-webhook's customer.subscription.trial_will_end is
  // the authoritative sender because Stripe hands it the exact price and date;
  // this sweep covers the case where that event never arrives. Both dedupe on
  // nurture_sends kind="trial_ending".
  //
  // Sent as a transactional notice: no marketing-consent check, no quality
  // gate. It states the amount, the date and how to cancel (WEB-LEGAL-006).
  const trialCutoff = new Date(now + TRIAL_WINDOW_DAYS * DAY).toISOString();
  const { data: trials, error: trialsError } = await supabase
    .from("user_subscriptions")
    .select("user_id, plan_id, current_period_end, trial_end, billing_interval")
    .eq("status", "trialing")
    .not("current_period_end", "is", null)
    .lte("current_period_end", trialCutoff)
    .limit(300);
  // RAISE. An empty result reports "0 trial-ending notices" as a successful
  // run, which is indistinguishable from nobody being in a trial - and this is
  // the billing disclosure WEB-LEGAL-006 requires, so a silent zero means
  // people are charged without being told (WEB-BE-032 AC2).
  if (trialsError) throw new Error(`trialing subscriptions read failed: ${trialsError.message}`);
  for (const t of (trials ?? []) as { user_id: string; plan_id: string | null; current_period_end: string; trial_end: string | null; billing_interval: string | null }[]) {
    // Email address only. The marketing-preference check is deliberately
    // absent here; this is a billing notice. See sendNotice above.
    const { data: profile, error: profileError } = await supabase.from("profiles").select("email").eq("user_id", t.user_id).maybeSingle();
    if (profileError) {
      // Skip this user, keep the batch going, and leave a trace: a notice that
      // silently never sends is the defect this story exists to fix.
      console.error(`trial notice: profile lookup failed for ${t.user_id}:`, profileError.message);
      continue;
    }
    const email = (profile as { email?: string } | null)?.email;
    if (!email) continue;
    if (await cappedRecently(supabase, t.user_id, "trial_ending", TRIAL_WINDOW_DAYS + 1)) continue;

    // Best-effort: without it the notice still sends, naming no amount.
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("display_name, price_monthly, price_yearly")
      .eq("id", t.plan_id)
      .maybeSingle();
    if (planError) {
      console.warn(`trial notice: plan lookup failed for ${t.user_id}, omitting amount:`, planError.message);
    }

    const notice = buildTrialNotice({
      planName: (plan as { display_name?: string } | null)?.display_name ?? "subscription",
      amount: planAmount(plan as { price_monthly?: number | null; price_yearly?: number | null } | null, t.billing_interval),
      interval: t.billing_interval,
      // trial_end is the charge date; current_period_end only coincides with it.
      chargeAt: t.trial_end ?? t.current_period_end,
      siteUrl: SITE,
    });

    if (await sendNotice(supabase, t.user_id, email, "trial_ending", notice.subject, notice.html, notice.text)) trial++;
  }

  // ── 2) Dunning (past_due) ────────────────────────────────────────────
  const { data: pastDue, error: pastDueError } = await supabase.from("user_subscriptions").select("user_id").eq("status", "past_due").limit(300);
  // Same reasoning as the trial sweep: a dunning notice nobody receives looks
  // exactly like nobody being past due.
  if (pastDueError) throw new Error(`past_due subscriptions read failed: ${pastDueError.message}`);
  for (const d of (pastDue ?? []) as { user_id: string }[]) {
    const c = await consented(supabase, d.user_id);
    if (!c || !c.allowed) continue;
    if (await cappedRecently(supabase, d.user_id, "dunning", DUNNING_GAP_DAYS)) continue;
    const html = `<h1>We couldn't process your payment</h1><p>No worries — we'll retry automatically. To avoid any interruption to your Insider access, you can update your payment method anytime.</p><p><a href="${SITE}/profile?tab=settings">Update payment method →</a></p>`;
    if (await sendStep(supabase, d.user_id, c.email, "dunning", "Action needed: update your payment method", html, "We couldn't process your payment; we'll retry. Update your payment method to keep Insider access.")) dunning++;
  }

  // ── 3) Upgrade prompts (engaged free users) ──────────────────────────
  const { data: freeEngaged, error: freeEngagedError } = await supabase
    .from("profiles")
    .select("user_id, email, lifecycle_signals")
    .eq("lifecycle_stage", "active")
    .not("email", "is", null)
    .limit(300);
  if (freeEngagedError) throw new Error(`engaged free users read failed: ${freeEngagedError.message}`);
  for (const p of (freeEngaged ?? []) as { user_id: string; email: string; lifecycle_signals: { messagingAllowed?: boolean } | null }[]) {
    if (p.lifecycle_signals?.messagingAllowed === false) continue;
    // Only prompt users WITHOUT an active/trialing paid sub (entitlement-safe read).
    // ENTITLEMENT READ, and the comment above already called it entitlement-safe
    // while it was not: `if (sub) continue` skips paying users, so a dropped
    // error leaves sub null and mails an UPGRADE PROMPT to someone who already
    // pays. Skip the user instead (WEB-BE-032 AC2).
    const { data: sub, error: subError } = await supabase.from("user_subscriptions").select("status").eq("user_id", p.user_id).in("status", ["active", "trialing"]).maybeSingle();
    if (subError) {
      console.warn(`[subscription-nurture] entitlement read failed for ${p.user_id}; skipping: ${subError.message}`);
      continue;
    }
    if (sub) continue;
    if (await cappedRecently(supabase, p.user_id, "upgrade_prompt", UPGRADE_GAP_DAYS)) continue;
    const html = `<h1>Get more from Des Moines Insider</h1><p>You're clearly enjoying the city — Insider unlocks premium picks and the AI Trip Planner to make every outing easier.</p><p><a href="${SITE}/profile?tab=settings">See Insider →</a></p>`;
    if (await sendStep(supabase, p.user_id, p.email, "upgrade_prompt", "Unlock more of Des Moines with Insider", html, "Insider unlocks premium picks and the AI Trip Planner. See Insider.")) upgrade++;
  }

  ctx.processed(trial + dunning + upgrade);
  ctx.summary(`subscription nurture: ${trial} trial-ending, ${dunning} dunning, ${upgrade} upgrade; ${converted} converted, ${recovered} recovered`);
  ctx.meta({ trial, dunning, upgrade, converted, recovered });
  return { trial, dunning, upgrade, converted, recovered };
};
