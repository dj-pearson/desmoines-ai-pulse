/**
 * agent milestone-recognition (AOS-NURTURE-006) — loyalty / streak / milestone recognition.
 *
 * Daily, for engaged users, detects the highest newly-crossed milestone across
 * saves, reviews, account anniversaries, and weekly active streaks. Records it
 * (in-app, user-readable) and — within frequency caps, consent, and the
 * AOS-GOV-004 quality gate — optionally emails a lightweight, on-brand
 * recognition. Signals are pulled in bulk (favorites/reviews for the batch,
 * aggregated in memory).
 *
 * Consolidated into `agent-runner` (was `agent-milestones/index.ts`).
 */
import { scoreOutput } from "../scoreOutput.ts";
import { sendNurtureEmail } from "../sendNurtureEmail.ts";
import { recentlyMessaged } from "../nurtureCoordination.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "milestone-recognition";
const BATCH = 300;
const EMAIL_GAP_DAYS = 7;      // at most one milestone email per week
const COORD_DAYS = 3;          // don't stack on other nurture sends
const DAY = 24 * 60 * 60 * 1000;
const SITE = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "https://desmoinesinsider.com").replace(/\/+$/, "");

const SAVE_THRESHOLDS = [5, 10, 25, 50, 100];
const REVIEW_THRESHOLDS = [1, 5, 10, 25];
const STREAK_THRESHOLDS = [4, 8, 12, 26, 52];

function highestCrossed(count: number, thresholds: number[]): number | null {
  let best: number | null = null;
  for (const t of thresholds) if (count >= t) best = t;
  return best;
}

// Weekly streak = consecutive ISO weeks (including the current or previous week)
// with at least one activity timestamp.
function weeklyStreak(timestamps: number[], now: number): number {
  if (timestamps.length === 0) return 0;
  const weekOf = (ms: number) => Math.floor((ms - new Date(new Date(ms).getFullYear(), 0, 1).getTime()) / (7 * DAY)) + new Date(ms).getFullYear() * 53;
  const weeks = new Set(timestamps.map(weekOf));
  let streak = 0;
  let cursor = weekOf(now);
  // Allow the streak to start at the current or the immediately-previous week.
  if (!weeks.has(cursor)) cursor -= 1;
  while (weeks.has(cursor)) { streak++; cursor -= 1; }
  return streak;
}

interface Candidate { type: string; value: number; label: string; }

export const run: AgentRun = async (ctx, { supabase }) => {
  const now = Date.now();
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, email, created_at, lifecycle_signals")
    .in("lifecycle_stage", ["active", "onboarding", "reactivated"])
    .not("email", "is", null)
    .limit(BATCH);
  // WEB-BE-032. THE work list. A dropped error processed nothing and reported a
  // successful run, indistinguishable from an empty profile batch.
  if (profilesError) throw new Error(`milestone-recognition: profile batch read failed: ${profilesError.message}`);
  const rows = (profiles ?? []) as { user_id: string; email: string; created_at: string; lifecycle_signals: { messagingAllowed?: boolean } | null }[];
  if (rows.length === 0) { ctx.summary("no engaged users"); return { recognized: 0, emailed: 0 }; }

  const userIds = rows.map((r) => r.user_id);
  const [favs, revs] = await Promise.all([
    supabase.from("content_favorites").select("user_id, created_at").in("user_id", userIds).limit(20000),
    supabase.from("event_reviews").select("user_id, created_at").in("user_id", userIds).limit(20000),
  ]);
  const favByUser = new Map<string, number[]>();
  const revByUser = new Map<string, number[]>();
  for (const f of (favs.data ?? []) as { user_id: string; created_at: string }[]) {
    (favByUser.get(f.user_id) ?? favByUser.set(f.user_id, []).get(f.user_id)!).push(new Date(f.created_at).getTime());
  }
  for (const r of (revs.data ?? []) as { user_id: string; created_at: string }[]) {
    (revByUser.get(r.user_id) ?? revByUser.set(r.user_id, []).get(r.user_id)!).push(new Date(r.created_at).getTime());
  }

  let recognized = 0, emailed = 0, gated = 0;

  for (const p of rows) {
    const favTs = favByUser.get(p.user_id) ?? [];
    const revTs = revByUser.get(p.user_id) ?? [];
    const saveCount = favTs.length;
    const reviewCount = revTs.length;
    const ageYears = Math.floor((now - new Date(p.created_at).getTime()) / (365 * DAY));
    const daysToAnniv = Math.abs(((now - new Date(p.created_at).getTime()) % (365 * DAY)) / DAY);
    const streak = weeklyStreak([...favTs, ...revTs], now);

    // Build candidate milestones (highest crossed per type).
    const candidates: Candidate[] = [];
    const s = highestCrossed(saveCount, SAVE_THRESHOLDS); if (s) candidates.push({ type: "saves", value: s, label: `${s} places saved` });
    const rv = highestCrossed(reviewCount, REVIEW_THRESHOLDS); if (rv) candidates.push({ type: "reviews", value: rv, label: `${rv} review${rv > 1 ? "s" : ""} written` });
    const st = highestCrossed(streak, STREAK_THRESHOLDS); if (st) candidates.push({ type: "streak", value: st, label: `${st}-week activity streak` });
    if (ageYears >= 1 && (daysToAnniv <= 2 || 365 - daysToAnniv <= 2)) candidates.push({ type: "anniversary", value: ageYears, label: `${ageYears}-year anniversary` });
    if (candidates.length === 0) continue;

    // Filter out already-recognized ones.
    const { data: existing, error: existingError } = await supabase.from("user_milestones").select("milestone_type, milestone_value").eq("user_id", p.user_id);
    // FAIL CLOSED. `seen` empty means every milestone reads as new, so a
    // dropped error re-recognises and RE-EMAILS milestones the user was
    // already congratulated for (WEB-BE-032 AC2).
    if (existingError) {
      console.warn(`[milestone-recognition] recognised-milestone read failed for ${p.user_id}; skipping: ${existingError.message}`);
      continue;
    }
    const seen = new Set((existing ?? []).map((e: { milestone_type: string; milestone_value: number }) => `${e.milestone_type}:${e.milestone_value}`));
    const fresh = candidates.filter((c) => !seen.has(`${c.type}:${c.value}`));
    if (fresh.length === 0) continue;

    // Recognize the single most notable new milestone this run.
    const pick = fresh.sort((a, b) => b.value - a.value)[0];

    // Decide whether to email (in-app is always recorded).
    let emailedNow = false, sendId: string | null = null;
    const consent = p.lifecycle_signals?.messagingAllowed !== false;
    if (consent) {
      const { data: lastEmail, error: lastEmailError } = await supabase.from("nurture_sends").select("created_at").eq("user_id", p.user_id).like("kind", "milestone_%").order("created_at", { ascending: false }).limit(1);
      // Same shape: a dropped error reads as "not emailed recently" and sends.
      const withinCapFallback = Boolean(lastEmailError);
      if (lastEmailError) console.warn(`[milestone-recognition] email cap read failed for ${p.user_id}; suppressing: ${lastEmailError.message}`);
      const withinCap = withinCapFallback || Boolean(lastEmail?.[0] && now - new Date(lastEmail[0].created_at).getTime() < EMAIL_GAP_DAYS * DAY);
      const overlapping = await recentlyMessaged(supabase, p.user_id, COORD_DAYS);
      if (!withinCap && !overlapping) {
        const subject = `Nice work — ${pick.label}! 🎉`;
        const html = `<h1>${pick.label} 🎉</h1><p>Thanks for being part of Des Moines Insider. Here's to many more great finds around the city!</p><p><a href="${SITE}/events">Keep exploring →</a></p>`;
        const text = `${pick.label}! Thanks for being part of Des Moines Insider. Keep exploring: ${SITE}/events`;
        const gate = await scoreOutput(supabase, { agentKey: AGENT_KEY, category: "nurture", content: text });
        if (gate.passed) {
          const res = await sendNurtureEmail(supabase, { agentKey: AGENT_KEY, kind: `milestone_${pick.type}`, userId: p.user_id, email: p.email, subject, bodyHtml: html, bodyText: text, qualityScore: gate.score });
          if (res.ok) { emailedNow = true; sendId = res.sendId ?? null; emailed++; }
        } else { gated++; }
      }
    }

    await supabase.from("user_milestones").insert({ user_id: p.user_id, milestone_type: pick.type, milestone_value: pick.value, label: pick.label, emailed: emailedNow, send_id: sendId });
    recognized++;
  }

  ctx.processed(rows.length);
  ctx.summary(`milestones: ${recognized} recognized (in-app), ${emailed} emailed, ${gated} quality-gated`);
  ctx.meta({ recognized, emailed, gated });
  return { recognized, emailed, gated };
};
