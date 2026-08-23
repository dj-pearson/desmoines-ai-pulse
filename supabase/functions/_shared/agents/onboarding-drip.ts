/**
 * agent onboarding-drip (AOS-NURTURE-002) — staged onboarding sequence.
 *
 * Every 6h, for users in lifecycle stage new/onboarding, sends the NEXT
 * appropriate step (welcome → key features → personalization → first-value),
 * gated on behavior (skip steps already completed), frequency-capped (≥1 day
 * between onboarding emails), unsubscribe-respecting, and quality-checked
 * (AOS-GOV-004) before send. Also stamps activation when a user takes the
 * first-value action after a send. Outcomes tracked in nurture_sends.
 *
 * Consolidated into `agent-runner` (was `agent-onboarding-drip/index.ts`).
 */
import { scoreOutput } from "../scoreOutput.ts";
import { sendNurtureEmail } from "../sendNurtureEmail.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "onboarding-drip";
const BATCH = 200;
const MIN_GAP_HOURS = 24; // frequency cap between onboarding emails
const DAY = 24 * 60 * 60 * 1000;
const SITE = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "https://desmoinesinsider.com").replace(/\/+$/, "");

interface Step {
  kind: string;
  subject: string;
  html: string;
  text: string;
  /** Skip if the user has already done this (behavior gate). */
  skipIf?: (ctx: { hasInterests: boolean; hasFavorite: boolean }) => boolean;
}

const STEPS: Step[] = [
  {
    kind: "onboarding_welcome",
    subject: "Welcome to Des Moines Insider 👋",
    html: `<h1>Welcome!</h1><p>Thanks for joining Des Moines Insider — your local guide to the best events, restaurants, and attractions around the city.</p><p><a href="${SITE}/events">Explore what's happening this week →</a></p>`,
    text: `Welcome to Des Moines Insider! Explore what's happening: ${SITE}/events`,
  },
  {
    kind: "onboarding_features",
    subject: "3 ways to get the most out of Des Moines Insider",
    html: `<h1>Get more out of it</h1><ul><li>Save events & restaurants to your favorites</li><li>Plan a night out with the AI Trip Planner</li><li>Find what's open now near you</li></ul><p><a href="${SITE}/trip-planner">Try the Trip Planner →</a></p>`,
    text: `Save favorites, use the AI Trip Planner, and find what's open now: ${SITE}/trip-planner`,
  },
  {
    kind: "onboarding_personalization",
    subject: "Tell us what you love — we'll tailor your picks",
    html: `<h1>Make it yours</h1><p>Add a few interests and we'll surface events and spots you'll actually care about.</p><p><a href="${SITE}/profile?tab=settings">Set your interests →</a></p>`,
    text: `Add your interests for tailored picks: ${SITE}/profile?tab=settings`,
    skipIf: (c) => c.hasInterests,
  },
  {
    kind: "onboarding_first_value",
    subject: "Save your first spot in Des Moines",
    html: `<h1>Find your first favorite</h1><p>Browse this weekend's events and tap the heart on one you like — we'll keep it handy for you.</p><p><a href="${SITE}/events/this-weekend">See this weekend →</a></p>`,
    text: `Save your first favorite this weekend: ${SITE}/events/this-weekend`,
    skipIf: (c) => c.hasFavorite,
  },
];

export const run: AgentRun = async (ctx, { supabase }) => {
  const now = Date.now();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, email, interests, communication_preferences, lifecycle_signals")
    .in("lifecycle_stage", ["new", "onboarding"])
    .not("email", "is", null)
    .limit(BATCH);
  const rows = (profiles ?? []) as { user_id: string; email: string; interests: unknown; communication_preferences: unknown; lifecycle_signals: unknown }[];

  let sent = 0, skipped = 0, gated = 0, activations = 0;

  for (const p of rows) {
    // Consent gate — the lifecycle classifier already computed messagingAllowed.
    const allowed = (p.lifecycle_signals as { messagingAllowed?: boolean } | null)?.messagingAllowed;
    if (allowed === false) { skipped++; continue; }

    // Prior onboarding sends for this user.
    const { data: priorSends } = await supabase
      .from("nurture_sends")
      .select("kind, created_at, id")
      .eq("user_id", p.user_id)
      .eq("agent_key", AGENT_KEY)
      .order("created_at", { ascending: false });
    const prior = (priorSends ?? []) as { kind: string; created_at: string; id: string }[];

    // Activation stamping: if a first-value send exists without activation and
    // the user now has a favorite created after it, record activation.
    const fvSend = prior.find((s) => s.kind === "onboarding_first_value");
    const { data: favs } = await supabase.from("content_favorites").select("created_at").eq("user_id", p.user_id).order("created_at", { ascending: false }).limit(1);
    const lastFav = (favs?.[0]?.created_at as string | undefined) ?? null;
    const hasFavorite = !!lastFav;
    if (fvSend && lastFav && new Date(lastFav).getTime() > new Date(fvSend.created_at).getTime()) {
      const { data: upd } = await supabase.from("nurture_sends").update({ activated_at: new Date().toISOString() }).eq("id", fvSend.id).is("activated_at", null).select("id");
      if (upd && upd.length) activations++;
    }

    // Frequency cap.
    if (prior.length && now - new Date(prior[0].created_at).getTime() < MIN_GAP_HOURS * 60 * 60 * 1000) { skipped++; continue; }

    const sentKinds = new Set(prior.map((s) => s.kind));
    const hasInterests = Array.isArray(p.interests) ? p.interests.length > 0 : !!p.interests;
    const behavior = { hasInterests, hasFavorite };

    // Next step = first not-yet-sent, not-skipped-by-behavior step.
    const next = STEPS.find((s) => !sentKinds.has(s.kind) && !(s.skipIf?.(behavior)));
    if (!next) { skipped++; continue; }

    // Quality gate (AOS-GOV-004) before send.
    const gate = await scoreOutput(supabase, { agentKey: AGENT_KEY, category: "nurture", content: `${next.subject}\n\n${next.text}` });
    if (!gate.passed) { gated++; continue; }

    const res = await sendNurtureEmail(supabase, {
      agentKey: AGENT_KEY,
      kind: next.kind,
      userId: p.user_id,
      email: p.email,
      subject: next.subject,
      bodyHtml: next.html,
      bodyText: next.text,
      qualityScore: gate.score,
    });
    if (res.ok) sent++; else skipped++;
  }

  ctx.processed(rows.length);
  ctx.summary(`onboarding: ${sent} sent, ${gated} quality-gated, ${activations} activation(s), ${skipped} skipped`);
  ctx.meta({ sent, gated, activations, skipped });
  return { sent, gated, activations, skipped };
};
