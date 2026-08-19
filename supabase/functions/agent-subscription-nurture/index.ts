/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: MEDIUM (emails subscribers at revenue moments — entitlement-safe,
 *   frequency-capped, unsubscribe-respecting; any courtesy credit is
 *   approval-gated, never auto-applied).
 *
 * agent-subscription-nurture (AOS-NURTURE-007) — trial / dunning / upgrade.
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
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { scoreOutput } from "../_shared/scoreOutput.ts";
import { sendNurtureEmail } from "../_shared/sendNurtureEmail.ts";

const AGENT_KEY = "subscription-nurture";
const TRIAL_WINDOW_DAYS = 3;
const DUNNING_GAP_DAYS = 3;   // aligned to Stripe retry cadence
const UPGRADE_GAP_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const SITE = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "https://desmoinesinsider.com").replace(/\/+$/, "");

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function consented(supabase: Client, userId: string): Promise<{ email: string; allowed: boolean } | null> {
  const { data } = await supabase.from("profiles").select("email, lifecycle_signals").eq("user_id", userId).maybeSingle();
  if (!data?.email) return null;
  return { email: data.email, allowed: (data.lifecycle_signals as { messagingAllowed?: boolean } | null)?.messagingAllowed !== false };
}

async function cappedRecently(supabase: Client, userId: string, kind: string, gapDays: number): Promise<boolean> {
  const { data } = await supabase.from("nurture_sends").select("created_at").eq("user_id", userId).eq("kind", kind).order("created_at", { ascending: false }).limit(1);
  return !!(data?.[0] && Date.now() - new Date(data[0].created_at).getTime() < gapDays * DAY);
}

async function sendStep(supabase: Client, userId: string, email: string, kind: string, subject: string, html: string, text: string): Promise<boolean> {
  const gate = await scoreOutput(supabase, { agentKey: AGENT_KEY, category: "nurture", content: text });
  if (!gate.passed) return false;
  const res = await sendNurtureEmail(supabase, { agentKey: AGENT_KEY, kind, userId, email, subject, bodyHtml: html, bodyText: text, qualityScore: gate.score });
  return res.ok;
}

Deno.serve(async (req) => {
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

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const now = Date.now();
    let trial = 0, dunning = 0, upgrade = 0, converted = 0, recovered = 0;

    // ── Conversion / recovery measurement (stamp activated_at) ────────────
    const { data: openSends } = await supabase
      .from("nurture_sends")
      .select("id, user_id, kind, created_at")
      .eq("agent_key", AGENT_KEY)
      .is("activated_at", null)
      .gte("created_at", new Date(now - 45 * DAY).toISOString())
      .lte("created_at", new Date(now - 1 * DAY).toISOString())
      .limit(1000);
    for (const s of (openSends ?? []) as { id: string; user_id: string; kind: string }[]) {
      const { data: sub } = await supabase.from("user_subscriptions").select("status").eq("user_id", s.user_id).in("status", ["active", "trialing"]).maybeSingle();
      const active = sub?.status === "active";
      if (!active) continue;
      const { data: upd } = await supabase.from("nurture_sends").update({ activated_at: new Date().toISOString() }).eq("id", s.id).is("activated_at", null).select("id");
      if (upd && upd.length) { if (s.kind === "dunning") recovered++; else converted++; }
    }

    // ── 1) Trial ending ──────────────────────────────────────────────────
    const trialCutoff = new Date(now + TRIAL_WINDOW_DAYS * DAY).toISOString();
    const { data: trials } = await supabase
      .from("user_subscriptions")
      .select("user_id, current_period_end")
      .eq("status", "trialing")
      .not("current_period_end", "is", null)
      .lte("current_period_end", trialCutoff)
      .limit(300);
    for (const t of (trials ?? []) as { user_id: string; current_period_end: string }[]) {
      const c = await consented(supabase, t.user_id);
      if (!c || !c.allowed) continue;
      if (await cappedRecently(supabase, t.user_id, "trial_ending", TRIAL_WINDOW_DAYS + 1)) continue;
      const html = `<h1>Your trial ends soon</h1><p>Keep your Insider perks — premium picks, the AI Trip Planner, and more — without interruption.</p><p><a href="${SITE}/profile?tab=settings">Manage your plan →</a></p>`;
      if (await sendStep(supabase, t.user_id, c.email, "trial_ending", "Your Des Moines Insider trial ends soon", html, "Your trial ends soon — keep your Insider perks. Manage your plan.")) trial++;
    }

    // ── 2) Dunning (past_due) ────────────────────────────────────────────
    const { data: pastDue } = await supabase.from("user_subscriptions").select("user_id").eq("status", "past_due").limit(300);
    for (const d of (pastDue ?? []) as { user_id: string }[]) {
      const c = await consented(supabase, d.user_id);
      if (!c || !c.allowed) continue;
      if (await cappedRecently(supabase, d.user_id, "dunning", DUNNING_GAP_DAYS)) continue;
      const html = `<h1>We couldn't process your payment</h1><p>No worries — we'll retry automatically. To avoid any interruption to your Insider access, you can update your payment method anytime.</p><p><a href="${SITE}/profile?tab=settings">Update payment method →</a></p>`;
      if (await sendStep(supabase, d.user_id, c.email, "dunning", "Action needed: update your payment method", html, "We couldn't process your payment; we'll retry. Update your payment method to keep Insider access.")) dunning++;
    }

    // ── 3) Upgrade prompts (engaged free users) ──────────────────────────
    const { data: freeEngaged } = await supabase
      .from("profiles")
      .select("user_id, email, lifecycle_signals")
      .eq("lifecycle_stage", "active")
      .not("email", "is", null)
      .limit(300);
    for (const p of (freeEngaged ?? []) as { user_id: string; email: string; lifecycle_signals: { messagingAllowed?: boolean } | null }[]) {
      if (p.lifecycle_signals?.messagingAllowed === false) continue;
      // Only prompt users WITHOUT an active/trialing paid sub (entitlement-safe read).
      // WEB-BE-032: the error is captured and this fails CLOSED. maybeSingle()
      // reports no-row as null data AND null error, so any error here is a real
      // read failure - and a discarded one made a PAYING subscriber look like a
      // free user and sent them an upgrade prompt.
      const { data: sub, error: subError } = await supabase.from("user_subscriptions").select("status").eq("user_id", p.user_id).in("status", ["active", "trialing"]).maybeSingle();
      if (subError || sub) continue;
      if (await cappedRecently(supabase, p.user_id, "upgrade_prompt", UPGRADE_GAP_DAYS)) continue;
      const html = `<h1>Get more from Des Moines Insider</h1><p>You're clearly enjoying the city — Insider unlocks premium picks and the AI Trip Planner to make every outing easier.</p><p><a href="${SITE}/profile?tab=settings">See Insider →</a></p>`;
      if (await sendStep(supabase, p.user_id, p.email, "upgrade_prompt", "Unlock more of Des Moines with Insider", html, "Insider unlocks premium picks and the AI Trip Planner. See Insider.")) upgrade++;
    }

    ctx.processed(trial + dunning + upgrade);
    ctx.summary(`subscription nurture: ${trial} trial-ending, ${dunning} dunning, ${upgrade} upgrade; ${converted} converted, ${recovered} recovered`);
    ctx.meta({ trial, dunning, upgrade, converted, recovered });
    return { trial, dunning, upgrade, converted, recovered };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
